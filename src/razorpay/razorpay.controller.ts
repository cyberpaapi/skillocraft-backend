import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import prisma from '../db/db.config';
import { computeCartTotalWithCode } from '../order/checkout.controller';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * When a buyer completes a purchase using someone's referral code, link them to
 * that referrer so the referrer starts earning on the buyer's orders (the
 * earnings calc in referral.controller reads these Referal links).
 *
 * - A customer can only be referred once (schema enforces referredId @unique),
 *   so the first code used wins and we never overwrite an existing link.
 * - A coupon code (which is not anyone's referral code) resolves to no referrer
 *   and is safely ignored.
 * - Never blocks/throws into the order flow — failures are logged only.
 */
async function linkReferralIfAny(referredCustomerId: string, rawCode?: string | null): Promise<void> {
  const code = (rawCode || '').trim();
  if (!code) return;
  try {
    const referrer = await prisma.customer.findUnique({
      where: { referalCode: code },
      select: { id: true },
    });
    if (!referrer || referrer.id === referredCustomerId) return;

    const existing = await prisma.referal.findUnique({
      where: { referredId: referredCustomerId },
      select: { id: true },
    });
    if (existing) return;

    await prisma.referal.create({
      data: {
        referrerId: referrer.id,
        referredId: referredCustomerId,
        referalCode: code,
      },
    });
    console.log('[Referral] Linked referrer', referrer.id, '-> referred', referredCustomerId);
  } catch (err) {
    // Unique-constraint race or transient error — never block the order on this.
    console.error('[Referral] Failed to link referral:', err);
  }
}

// ─── Course checkout ──────────────────────────────────────────────────────────

export const createCourseRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.email) return res.status(401).json({ status: 0, message: 'Authentication required' });

    const { cartIds, code } = req.body;
    if (!cartIds?.length) {
      return res.status(400).json({ status: 0, message: 'cartIds are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: req.user.email }, select: { id: true } });
    const customer = user ? await prisma.customer.findFirst({ where: { userId: user.id }, select: { id: true } }) : null;
    if (!user || !customer) return res.status(403).json({ status: 0, message: 'Customer not found' });

    // Compute the authoritative amount server-side (applies coupon/referral code if valid)
    const pricing = await computeCartTotalWithCode({ userId: user.id, customerId: customer.id, cartIds, code });
    if (pricing.error) {
      return res.status(400).json({ status: 0, message: pricing.error });
    }
    if (pricing.finalTotal <= 0) {
      return res.status(400).json({ status: 0, message: 'Cart total is invalid' });
    }

    const finalAmount = pricing.finalTotal;
    const amountPaise = Math.round(finalAmount * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `course_${Date.now()}`,
      notes: {
        type: 'course',
        customerId: customer.id,
        userId: user.id,
        cartIds: cartIds.join(','),
        totalAmount: finalAmount.toFixed(2),
        discount: pricing.discount.toFixed(2),
        code: pricing.applied?.code || '',
      } as any,
    });

    return res.json({
      status: 1,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        totalAmount: finalAmount.toFixed(2),
        discount: pricing.discount.toFixed(2),
        applied: pricing.applied,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyCoursePayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.email) return res.status(401).json({ status: 0, message: 'Authentication required' });

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, cartIds, totalAmount } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !cartIds?.length) {
      return res.status(400).json({ status: 0, message: 'Missing payment verification fields' });
    }

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });
    }

    const user = await prisma.user.findUnique({ where: { email: req.user.email }, include: { customer: true } });
    if (!user?.customer) return res.status(403).json({ status: 0, message: 'Customer profile not found' });

    const customer = await prisma.customer.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });
    if (!customer) return res.status(403).json({ status: 0, message: 'Active customer not found' });

    // Check if order already exists for this payment (webhook may have already created it)
    const existing = await prisma.orders.findFirst({ where: { transactionId: razorpayPaymentId } });
    if (existing) return res.json({ status: 1, message: 'Order already created', data: existing });

    const cartItems = await prisma.cart.findMany({
      where: { id: { in: cartIds }, userId: user.id, status: 'ACTIVE' },
      include: { course: true },
    });
    if (!cartItems.length) return res.status(400).json({ status: 0, message: 'No valid cart items found' });

    const order = await prisma.orders.create({
      data: {
        customer: { connect: { id: customer.id } },
        totalAmount: parseFloat(totalAmount).toString(),
        paidAmount: parseFloat(totalAmount).toString(),
        transactionId: razorpayPaymentId,
        TransactionType: 'DEBIT',
        paymentType: 'ONLINE',
        status: 'ACTIVE',
        description: `Razorpay payment for ${cartItems.length} course(s)`,
        course: { connect: cartItems.map(item => ({ id: item.courseId })) },
      },
    });

    await prisma.cart.deleteMany({ where: { id: { in: cartIds }, userId: user.id } });

    // Credit the referrer (if a referral code was used) — read the code from the
    // Razorpay order notes so it can't be tampered with client-side.
    try {
      const rzpOrder = await razorpay.orders.fetch(razorpayOrderId);
      await linkReferralIfAny(customer.id, (rzpOrder?.notes as any)?.code);
    } catch (e) {
      console.error('[Referral] Could not fetch order notes for referral linking:', e);
    }

    return res.json({ status: 1, message: 'Payment verified and order created', data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Marketplace checkout ─────────────────────────────────────────────────────

export const createMarketplaceRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId, quantity = 1, recipientName, phone, addressLine, city, state, pinCode, country } = req.body;
    if (!productId) return res.status(400).json({ status: 0, message: 'productId is required' });

    const customer = req.user ? await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } }) : null;
    if (!customer) return res.status(403).json({ status: 0, message: 'Customer not found' });

    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Product not found' });

    const totalAmount = parseFloat(product.price) * Number(quantity);
    const amountPaise = Math.round(totalAmount * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `mp_${Date.now()}`,
      notes: {
        type: 'marketplace',
        customerId: customer.id,
        productId,
        quantity: String(quantity),
        totalAmount: totalAmount.toFixed(2),
        recipientName: recipientName || '',
        phone: phone || '',
        addressLine: (addressLine || '').substring(0, 200),
        city: city || '',
        state: state || '',
        pinCode: pinCode || '',
        country: country || '',
      } as any,
    });

    return res.json({
      status: 1,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        totalAmount: totalAmount.toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyMarketplacePayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CUSTOMER') return res.status(403).json({ status: 0, message: 'Customer login required' });

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, productId, quantity, recipientName, phone, addressLine, city, state, pinCode, country, totalAmount } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !productId || !addressLine || !pinCode) {
      return res.status(400).json({ status: 0, message: 'Missing required fields' });
    }

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });
    }

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ status: 0, message: 'Customer not found' });

    // Check if webhook already created this order
    const existing = await prisma.marketplaceOrder.findFirst({ where: { customerId: customer.id, totalAmount: String(totalAmount), createdAt: { gte: new Date(Date.now() - 60000) } } });
    if (existing) return res.json({ status: 1, message: 'Order already created', data: existing });

    const order = await prisma.marketplaceOrder.create({
      data: {
        customerId: customer.id,
        productId,
        quantity: Number(quantity) || 1,
        totalAmount: String(totalAmount),
        recipientName: recipientName || null,
        phone: phone || null,
        addressLine,
        city: city || null,
        state: state || null,
        pinCode,
        country: country || null,
      },
    });

    return res.json({ status: 1, message: 'Payment verified and order placed', data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Live event checkout ──────────────────────────────────────────────────────

export const createEventRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ status: 0, message: 'Authentication required' });
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ status: 0, message: 'eventId is required' });

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(403).json({ status: 0, message: 'Customer not found' });

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ status: 0, message: 'Event not found' });

    const already = await prisma.eventRegistration.findUnique({
      where: { eventId_customerId: { eventId, customerId: customer.id } },
    });
    if (already) return res.status(400).json({ status: 0, message: 'Already registered for this event' });

    const amount = parseFloat(event.price || '0');
    if (!(amount > 0)) return res.status(400).json({ status: 0, message: 'This is a free event — no payment needed' });

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `event_${Date.now()}`,
      notes: {
        type: 'event',
        customerId: customer.id,
        userId: req.user.id,
        eventId,
        amount: amount.toFixed(2),
      } as any,
    });

    return res.json({
      status: 1,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEventPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ status: 0, message: 'Authentication required' });
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, eventId } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !eventId) {
      return res.status(400).json({ status: 0, message: 'Missing payment verification fields' });
    }

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });
    }

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ status: 0, message: 'Customer not found' });

    const existing = await prisma.eventRegistration.findUnique({
      where: { eventId_customerId: { eventId, customerId: customer.id } },
    });
    if (existing) return res.json({ status: 1, message: 'Already registered', data: existing });

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { price: true } });
    const registration = await prisma.eventRegistration.create({
      data: { eventId, customerId: customer.id, amount: event?.price || '0' },
    });

    return res.json({ status: 1, message: 'Payment verified and registered', data: registration });
  } catch (error) {
    next(error);
  }
};

// ─── Marketplace cart checkout (multi-item) ──────────────────────────────────

export const createMarketplaceCartRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ status: 0, message: 'Authentication required' });
    const { recipientName, phone, addressLine, city, state, pinCode, country } = req.body;
    if (!addressLine || !pinCode) return res.status(400).json({ status: 0, message: 'Address and pincode are required' });

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(403).json({ status: 0, message: 'Customer not found' });

    const items = await prisma.marketplaceCart.findMany({ where: { customerId: customer.id }, include: { product: true } });
    if (items.length === 0) return res.status(400).json({ status: 0, message: 'Your cart is empty' });

    const totalAmount = items.reduce((s, i) => s + parseFloat(i.product.price) * i.quantity, 0);
    const cartIds = items.map((i) => i.id).join(',');

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: 'INR',
      receipt: `mpcart_${Date.now()}`,
      notes: {
        type: 'marketplace_cart',
        customerId: customer.id,
        userId: req.user.id,
        cartIds,
        totalAmount: totalAmount.toFixed(2),
        recipientName: recipientName || '',
        phone: phone || '',
        addressLine: (addressLine || '').substring(0, 200),
        city: city || '',
        state: state || '',
        pinCode: pinCode || '',
        country: country || '',
      } as any,
    });

    return res.json({
      status: 1,
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, totalAmount: totalAmount.toFixed(2) },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyMarketplaceCartPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CUSTOMER') return res.status(403).json({ status: 0, message: 'Customer login required' });
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, recipientName, phone, addressLine, city, state, pinCode, country } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !addressLine || !pinCode) {
      return res.status(400).json({ status: 0, message: 'Missing required fields' });
    }

    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expectedSig !== razorpaySignature) return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ status: 0, message: 'Customer not found' });

    const items = await prisma.marketplaceCart.findMany({ where: { customerId: customer.id }, include: { product: true } });
    if (items.length === 0) return res.json({ status: 1, message: 'Order already processed', data: [] });

    const created = [];
    for (const i of items) {
      const order = await prisma.marketplaceOrder.create({
        data: {
          customerId: customer.id,
          productId: i.productId,
          quantity: i.quantity,
          totalAmount: String((parseFloat(i.product.price) * i.quantity).toFixed(2)),
          recipientName: recipientName || null,
          phone: phone || null,
          addressLine,
          city: city || null,
          state: state || null,
          pinCode,
          country: country || null,
        },
      });
      created.push(order);
    }
    await prisma.marketplaceCart.deleteMany({ where: { customerId: customer.id } });

    return res.json({ status: 1, message: 'Payment verified and orders placed', data: created });
  } catch (error) {
    next(error);
  }
};

// ─── Event cart checkout (multi-event) ────────────────────────────────────────

export const createEventCartRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ status: 0, message: 'Authentication required' });
    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(403).json({ status: 0, message: 'Customer not found' });

    const items = await prisma.eventCart.findMany({ where: { customerId: customer.id }, include: { event: true } });
    if (items.length === 0) return res.status(400).json({ status: 0, message: 'Your event cart is empty' });

    const totalAmount = items.reduce((s, i) => s + parseFloat(i.event.price || '0'), 0);

    // All-free cart → register directly, no payment needed
    if (!(totalAmount > 0)) {
      for (const i of items) {
        await prisma.eventRegistration.upsert({
          where: { eventId_customerId: { eventId: i.eventId, customerId: customer.id } },
          update: {},
          create: { eventId: i.eventId, customerId: customer.id, amount: i.event.price || '0' },
        });
      }
      await prisma.eventCart.deleteMany({ where: { customerId: customer.id } });
      return res.json({ status: 1, free: true, message: 'Registered for all events' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: 'INR',
      receipt: `evcart_${Date.now()}`,
      notes: {
        type: 'event_cart',
        customerId: customer.id,
        userId: req.user.id,
        eventIds: items.map((i) => i.eventId).join(','),
        totalAmount: totalAmount.toFixed(2),
      } as any,
    });

    return res.json({
      status: 1,
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, totalAmount: totalAmount.toFixed(2) },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEventCartPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CUSTOMER') return res.status(403).json({ status: 0, message: 'Customer login required' });
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return res.status(400).json({ status: 0, message: 'Missing payment fields' });

    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expectedSig !== razorpaySignature) return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });

    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ status: 0, message: 'Customer not found' });

    const items = await prisma.eventCart.findMany({ where: { customerId: customer.id }, include: { event: true } });
    if (items.length === 0) return res.json({ status: 1, message: 'Already processed', data: [] });

    for (const i of items) {
      await prisma.eventRegistration.upsert({
        where: { eventId_customerId: { eventId: i.eventId, customerId: customer.id } },
        update: {},
        create: { eventId: i.eventId, customerId: customer.id, amount: i.event.price || '0' },
      });
    }
    await prisma.eventCart.deleteMany({ where: { customerId: customer.id } });

    return res.json({ status: 1, message: 'Payment verified and registered', data: items.map((i) => i.eventId) });
  } catch (error) {
    next(error);
  }
};

// ─── Webhook (server-to-server, fires even if browser closes) ─────────────────

export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody as Buffer;

    if (!signature || !rawBody) return res.status(400).json({ error: 'Missing signature or body' });

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (expectedSig !== signature) {
      console.error('[Webhook] Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('[Webhook] Event received:', event.event);

    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      const notes = payment?.notes || {};
      const paymentId = payment?.id;

      if (notes.type === 'course') {
        const { customerId, userId, cartIds: cartIdsStr, totalAmount } = notes;
        const cartIds: string[] = (cartIdsStr || '').split(',').filter(Boolean);

        if (!customerId || !cartIds.length) {
          console.error('[Webhook] Missing course order data in notes');
          return res.json({ status: 'ok' });
        }

        // Idempotency — skip if order already exists for this payment
        const existing = await prisma.orders.findFirst({ where: { transactionId: paymentId } });
        if (existing) {
          console.log('[Webhook] Course order already exists, skipping');
          return res.json({ status: 'ok' });
        }

        const cartItems = await prisma.cart.findMany({
          where: { id: { in: cartIds }, status: 'ACTIVE' },
          include: { course: true },
        });

        if (cartItems.length > 0) {
          await prisma.orders.create({
            data: {
              customer: { connect: { id: customerId } },
              totalAmount: String(totalAmount),
              paidAmount: String(totalAmount),
              transactionId: paymentId,
              TransactionType: 'DEBIT',
              paymentType: 'ONLINE',
              status: 'ACTIVE',
              description: `Razorpay webhook — ${cartItems.length} course(s)`,
              course: { connect: cartItems.map(item => ({ id: item.courseId })) },
            },
          });

          await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });

          // Credit the referrer (if a referral code was used on this purchase)
          await linkReferralIfAny(customerId, notes.code);

          console.log('[Webhook] Course order created via webhook for payment', paymentId);
        }

      } else if (notes.type === 'marketplace') {
        const { customerId, productId, quantity, totalAmount, recipientName, phone, addressLine, city, state, pinCode, country } = notes;

        if (!customerId || !productId || !addressLine || !pinCode) {
          console.error('[Webhook] Missing marketplace order data in notes');
          return res.json({ status: 'ok' });
        }

        // Idempotency — skip if recently created (within 2 min)
        const existing = await prisma.marketplaceOrder.findFirst({
          where: { customerId, productId, createdAt: { gte: new Date(Date.now() - 120000) } },
        });
        if (existing) {
          console.log('[Webhook] Marketplace order already exists, skipping');
          return res.json({ status: 'ok' });
        }

        await prisma.marketplaceOrder.create({
          data: {
            customerId,
            productId,
            quantity: Number(quantity) || 1,
            totalAmount: String(totalAmount),
            recipientName: recipientName || null,
            phone: phone || null,
            addressLine,
            city: city || null,
            state: state || null,
            pinCode,
            country: country || null,
          },
        });

        console.log('[Webhook] Marketplace order created via webhook for payment', paymentId);
      } else if (notes.type === 'event') {
        const { customerId, eventId, amount } = notes;
        if (!customerId || !eventId) {
          console.error('[Webhook] Missing event registration data in notes');
          return res.json({ status: 'ok' });
        }
        const existing = await prisma.eventRegistration.findUnique({
          where: { eventId_customerId: { eventId, customerId } },
        });
        if (existing) {
          console.log('[Webhook] Event registration already exists, skipping');
          return res.json({ status: 'ok' });
        }
        await prisma.eventRegistration.create({
          data: { eventId, customerId, amount: String(amount || '0') },
        });
        console.log('[Webhook] Event registration created via webhook for payment', paymentId);

      } else if (notes.type === 'marketplace_cart') {
        const { customerId, cartIds: cartIdsStr, recipientName, phone, addressLine, city, state, pinCode, country } = notes;
        const cartIds: string[] = (cartIdsStr || '').split(',').filter(Boolean);
        if (!customerId || cartIds.length === 0 || !addressLine || !pinCode) return res.json({ status: 'ok' });

        const items = await prisma.marketplaceCart.findMany({ where: { id: { in: cartIds }, customerId }, include: { product: true } });
        if (items.length === 0) { console.log('[Webhook] Marketplace cart already processed'); return res.json({ status: 'ok' }); }

        for (const i of items) {
          await prisma.marketplaceOrder.create({
            data: {
              customerId, productId: i.productId, quantity: i.quantity,
              totalAmount: String((parseFloat(i.product.price) * i.quantity).toFixed(2)),
              recipientName: recipientName || null, phone: phone || null, addressLine, city: city || null, state: state || null, pinCode, country: country || null,
            },
          });
        }
        await prisma.marketplaceCart.deleteMany({ where: { id: { in: cartIds } } });
        console.log('[Webhook] Marketplace cart orders created via webhook for payment', paymentId);

      } else if (notes.type === 'event_cart') {
        const { customerId, eventIds: eventIdsStr } = notes;
        const eventIds: string[] = (eventIdsStr || '').split(',').filter(Boolean);
        if (!customerId || eventIds.length === 0) return res.json({ status: 'ok' });

        const items = await prisma.eventCart.findMany({ where: { eventId: { in: eventIds }, customerId }, include: { event: true } });
        if (items.length === 0) { console.log('[Webhook] Event cart already processed'); return res.json({ status: 'ok' }); }

        for (const i of items) {
          await prisma.eventRegistration.upsert({
            where: { eventId_customerId: { eventId: i.eventId, customerId } },
            update: {},
            create: { eventId: i.eventId, customerId, amount: i.event.price || '0' },
          });
        }
        await prisma.eventCart.deleteMany({ where: { eventId: { in: eventIds }, customerId } });
        console.log('[Webhook] Event cart registrations created via webhook for payment', paymentId);
      }
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
