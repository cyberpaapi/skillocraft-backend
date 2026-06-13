import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import prisma from '../db/db.config';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ─── Course checkout ──────────────────────────────────────────────────────────

export const createCourseRazorpayOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { cartIds, totalAmount } = req.body;
    if (!cartIds?.length || !totalAmount) {
      return res.status(400).json({ status: 0, message: 'cartIds and totalAmount are required' });
    }

    const amountPaise = Math.round(parseFloat(totalAmount) * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `course_${Date.now()}`,
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

export const verifyCoursePayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ status: 0, message: 'Authentication required' });
    }

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      cartIds,
      totalAmount,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !cartIds?.length) {
      return res.status(400).json({ status: 0, message: 'Missing payment verification fields' });
    }

    // Verify Razorpay signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });
    }

    const user = await prisma.user.findUnique({
      where: { email: req.user.email },
      include: { customer: true },
    });
    if (!user?.customer) {
      return res.status(403).json({ status: 0, message: 'Customer profile not found' });
    }

    const customer = await prisma.customer.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
    });
    if (!customer) {
      return res.status(403).json({ status: 0, message: 'Active customer not found' });
    }

    const cartItems = await prisma.cart.findMany({
      where: { id: { in: cartIds }, userId: user.id, status: 'ACTIVE' },
      include: { course: true },
    });
    if (!cartItems.length) {
      return res.status(400).json({ status: 0, message: 'No valid cart items found' });
    }

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
    const { productId, quantity = 1 } = req.body;
    if (!productId) {
      return res.status(400).json({ status: 0, message: 'productId is required' });
    }

    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ status: 0, message: 'Product not found' });
    }

    const totalAmount = parseFloat(product.price) * Number(quantity);
    const amountPaise = Math.round(totalAmount * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `mp_${Date.now()}`,
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
    if (!req.user || req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ status: 0, message: 'Customer login required' });
    }

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      productId,
      quantity,
      recipientName,
      phone,
      addressLine,
      city,
      state,
      pinCode,
      country,
      totalAmount,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !productId || !addressLine || !pinCode) {
      return res.status(400).json({ status: 0, message: 'Missing required fields' });
    }

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ status: 0, message: 'Payment verification failed — invalid signature' });
    }

    const customer = await prisma.customer.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!customer) {
      return res.status(404).json({ status: 0, message: 'Customer not found' });
    }

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
