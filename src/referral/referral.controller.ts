import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export const getReferralSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const settings = await prisma.referralSettings.findUnique({
      where: { id: 'SINGLETON' }
    });
    res.json({
      discountPercent: settings?.discountPercent ?? 20,
      earningsPercent: settings?.earningsPercent ?? 20
    });
  } catch (error) {
    next(error);
  }
};

export const updateReferralSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const discountPercent = parseFloat(req.body.discountPercent);
    const earningsPercent = parseFloat(req.body.earningsPercent);

    if (isNaN(discountPercent) || isNaN(earningsPercent) ||
        discountPercent < 0 || discountPercent > 100 ||
        earningsPercent < 0 || earningsPercent > 100) {
      res.status(400).json({ error: 'Percentages must be between 0 and 100' });
      return;
    }

    const settings = await prisma.referralSettings.upsert({
      where: { id: 'SINGLETON' },
      update: { discountPercent, earningsPercent, updatedBy: req.user.email },
      create: { id: 'SINGLETON', discountPercent, earningsPercent, updatedBy: req.user.email }
    });

    res.json({
      message: 'Referral settings updated successfully',
      discountPercent: settings.discountPercent,
      earningsPercent: settings.earningsPercent
    });
  } catch (error) {
    next(error);
  }
};

export const updateUpiId = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { upiId } = req.body;
    if (!upiId || typeof upiId !== 'string' || upiId.trim().length === 0) {
      res.status(400).json({ error: 'Invalid UPI ID' });
      return;
    }
    const customer = await prisma.customer.findFirst({ where: { userId: req.user.id, status: 'ACTIVE' } });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    await prisma.customer.update({ where: { id: customer.id }, data: { upiId: upiId.trim() } });
    res.json({ message: 'UPI ID updated successfully', upiId: upiId.trim() });
  } catch (error) {
    next(error);
  }
};

export const requestPayout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const customer = await prisma.customer.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      select: {
        id: true,
        upiId: true,
        referredCustomers: {
          where: { status: 'ACTIVE' },
          select: {
            referred: {
              select: {
                orders: {
                  where: { status: 'ACTIVE' },
                  select: { paidAmount: true }
                }
              }
            }
          }
        }
      }
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    if (!customer.upiId) {
      res.status(400).json({ error: 'Please add your UPI ID before requesting a payout' });
      return;
    }

    const settings = await prisma.referralSettings.findUnique({ where: { id: 'SINGLETON' } });
    const earningsPercent = settings?.earningsPercent ?? 20;

    // Calculate total earnings
    let totalEarnings = 0;
    for (const ref of customer.referredCustomers) {
      for (const order of ref.referred.orders) {
        totalEarnings += (parseFloat(order.paidAmount) || 0) * earningsPercent / 100;
      }
    }

    // Calculate already-paid amount
    const settled = await prisma.payoutRequest.findMany({
      where: { customerId: customer.id, status: 'SETTLED' },
      select: { amount: true }
    });
    const settledTotal = settled.reduce((s, p) => s + p.amount, 0);
    const pendingPayouts = await prisma.payoutRequest.findMany({
      where: { customerId: customer.id, status: 'PENDING' },
      select: { amount: true }
    });
    const pendingTotal = pendingPayouts.reduce((s, p) => s + p.amount, 0);

    const available = Math.round((totalEarnings - settledTotal - pendingTotal) * 100) / 100;

    if (available <= 0) {
      res.status(400).json({ error: 'No available balance to request payout' });
      return;
    }

    const payout = await prisma.payoutRequest.create({
      data: {
        customerId: customer.id,
        amount: available,
        upiId: customer.upiId,
        status: 'PENDING',
      }
    });

    res.json({ message: 'Payout request submitted', payout });
  } catch (error) {
    next(error);
  }
};

export const getPayoutRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const requests = await prisma.payoutRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, name: true, user: { select: { email: true } } }
        }
      }
    });
    res.json({ requests });
  } catch (error) {
    next(error);
  }
};

export const updatePayoutRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const { status, note } = req.body;
    if (!['SETTLED', 'REJECTED', 'PENDING'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const payout = await prisma.payoutRequest.update({
      where: { id },
      data: { status, note: note || null }
    });
    res.json({ message: 'Payout request updated', payout });
  } catch (error) {
    next(error);
  }
};

export const getMyReferralData = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const customer = await prisma.customer.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      select: {
        id: true,
        referalCode: true,
        upiId: true,
        referredCustomers: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            referred: {
              select: {
                name: true,
                orders: {
                  where: { status: 'ACTIVE' },
                  select: { paidAmount: true, createdAt: true }
                }
              }
            }
          }
        }
      }
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const settings = await prisma.referralSettings.findUnique({
      where: { id: 'SINGLETON' }
    });
    const earningsPercent = settings?.earningsPercent ?? 20;
    const discountPercent = settings?.discountPercent ?? 20;

    let totalEarnings = 0;
    const referredUsers = customer.referredCustomers.map((ref) => {
      const userEarnings = ref.referred.orders.reduce((sum, order) => {
        const amount = parseFloat(order.paidAmount) || 0;
        return sum + (amount * earningsPercent) / 100;
      }, 0);
      totalEarnings += userEarnings;
      return {
        name: ref.referred.name,
        orderCount: ref.referred.orders.length,
        earnings: Math.round(userEarnings * 100) / 100
      };
    });

    // Calculate settled and pending amounts
    const payouts = await prisma.payoutRequest.findMany({
      where: { customerId: customer.id },
      select: { amount: true, status: true }
    });
    const settledAmount = payouts.filter(p => p.status === 'SETTLED').reduce((s, p) => s + p.amount, 0);
    const pendingAmount = payouts.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
    const availableAmount = Math.max(0, Math.round((totalEarnings - settledAmount - pendingAmount) * 100) / 100);

    res.json({
      referralCode: customer.referalCode,
      upiId: customer.upiId || null,
      referredCount: customer.referredCustomers.length,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      settledAmount: Math.round(settledAmount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      availableAmount,
      earningsPercent,
      discountPercent,
      referredUsers
    });
  } catch (error) {
    next(error);
  }
};
