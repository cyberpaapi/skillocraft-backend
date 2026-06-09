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

    res.json({
      referralCode: customer.referalCode,
      referredCount: customer.referredCustomers.length,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      earningsPercent,
      discountPercent,
      referredUsers
    });
  } catch (error) {
    next(error);
  }
};
