import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export interface CartDiscountResult {
  baseTotal: number;
  discount: number;
  finalTotal: number;
  applied: null | { type: 'coupon' | 'referral'; code: string; label: string };
  error?: string;
}

/**
 * Computes the cart total and applies a coupon code OR a referral code (if provided).
 * This is the authoritative price calculation used for both validation and order creation —
 * the client-supplied amount is never trusted.
 */
export async function computeCartTotalWithCode(opts: {
  userId: string;
  customerId: string;
  cartIds: string[];
  code?: string;
}): Promise<CartDiscountResult> {
  const { userId, customerId, cartIds, code } = opts;

  const cartItems = await prisma.cart.findMany({
    where: { id: { in: cartIds }, userId, status: 'ACTIVE' },
    include: { course: { select: { id: true, price: true } } },
  });

  const priceOf = (c: { price: string }) => {
    const p = parseFloat(c.price);
    return isNaN(p) ? 0 : p;
  };

  const baseTotal = cartItems.reduce((s, it) => s + priceOf(it.course), 0);

  const base: CartDiscountResult = { baseTotal, discount: 0, finalTotal: baseTotal, applied: null };

  const trimmed = (code || '').trim();
  if (!trimmed) return base;

  // ── Try a discount coupon first ──
  const coupon = await prisma.discountCoupon.findFirst({
    where: { couponId: trimmed, status: 'ACTIVE' },
    include: { course: { select: { id: true } } },
  });

  if (coupon) {
    const now = new Date();
    if (coupon.discountStartDate && now < coupon.discountStartDate) {
      return { ...base, error: 'This coupon is not active yet' };
    }
    if (coupon.diacountEndDate && now > coupon.diacountEndDate) {
      return { ...base, error: 'This coupon has expired' };
    }

    // If the coupon is restricted to specific courses, only discount those
    const couponCourseIds = coupon.course.map((c) => c.id);
    let applicableTotal = baseTotal;
    if (couponCourseIds.length > 0) {
      applicableTotal = cartItems
        .filter((it) => couponCourseIds.includes(it.courseId))
        .reduce((s, it) => s + priceOf(it.course), 0);
      if (applicableTotal <= 0) {
        return { ...base, error: 'This coupon does not apply to the courses in your cart' };
      }
    }

    const amt = parseFloat(coupon.amount) || 0;
    let discount = coupon.amountType === 'PERCENT' ? (applicableTotal * amt) / 100 : amt;
    discount = Math.min(discount, baseTotal);
    discount = Math.round(discount * 100) / 100;
    return {
      baseTotal,
      discount,
      finalTotal: Math.max(0, Math.round((baseTotal - discount) * 100) / 100),
      applied: { type: 'coupon', code: trimmed, label: coupon.name || 'Coupon applied' },
    };
  }

  // ── Otherwise try a referral code ──
  const referrer = await prisma.customer.findUnique({
    where: { referalCode: trimmed },
    select: { id: true },
  });

  if (!referrer) {
    return { ...base, error: 'Invalid coupon or referral code' };
  }
  if (referrer.id === customerId) {
    return { ...base, error: 'You cannot use your own referral code' };
  }

  const settings = await prisma.referralSettings.findUnique({ where: { id: 'SINGLETON' } });
  const pct = settings?.discountPercent ?? 20;
  let discount = (baseTotal * pct) / 100;
  discount = Math.min(discount, baseTotal);
  discount = Math.round(discount * 100) / 100;
  return {
    baseTotal,
    discount,
    finalTotal: Math.max(0, Math.round((baseTotal - discount) * 100) / 100),
    applied: { type: 'referral', code: trimmed, label: `${pct}% referral discount` },
  };
}

// POST /checkout/validate-code  — validate a coupon/referral code against the cart
export const validateDiscountCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.email) {
      res.status(401).json({ status: 0, message: 'Authentication required' });
      return;
    }
    const { code, cartIds } = req.body;
    if (!cartIds?.length) {
      res.status(400).json({ status: 0, message: 'cartIds are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: req.user.email }, select: { id: true } });
    const customer = user ? await prisma.customer.findFirst({ where: { userId: user.id }, select: { id: true } }) : null;
    if (!user || !customer) {
      res.status(403).json({ status: 0, message: 'Customer not found' });
      return;
    }

    const result = await computeCartTotalWithCode({ userId: user.id, customerId: customer.id, cartIds, code });

    if (result.error) {
      res.json({ status: 1, valid: false, message: result.error, data: result });
      return;
    }

    res.json({
      status: 1,
      valid: !!result.applied,
      message: result.applied ? 'Code applied' : 'No code provided',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
