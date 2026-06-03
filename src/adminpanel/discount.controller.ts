import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import prisma from '../db/db.config';
import { discountCouponSchema } from '../schemas/discount.schema';
import { AuthRequest } from '../types';

export const createDiscountCoupon = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure only admin can create discount coupons
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Unauthorized to create discount coupon' });
      return;
    }

    // Validate input
    const validatedData = discountCouponSchema.parse({
      ...req.body,
      createdBy: req.user?.email || 'system'
    });

    // Create discount coupon
    const discountCoupon = await prisma.discountCoupon.create({
      data: {
        name: validatedData.name,
        couponId: validatedData.couponId,
        amount: validatedData.amount,
        amountType: validatedData.amountType,
        discountStartDate: new Date(validatedData.discountStartDate),
        diacountEndDate: new Date(validatedData.discountEndDate),
        status: validatedData.status || 'ACTIVE',
        createdBy: validatedData.createdBy || 'system', // Add fallback
        course: {
          connect: validatedData.courseIds?.map(id => ({ id })) || []
        },
        customer: {
          connect: validatedData.customerIds?.map(id => ({ id })) || []
        }
      }
    });

    res.status(201).json({ 
      message: 'Discount coupon created successfully',
      discountCoupon: {
        id: discountCoupon.id,
        name: discountCoupon.name,
        couponId: discountCoupon.couponId
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    next(error);
  }
};

export const updateDiscountCoupon = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure only admin can update discount coupons
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Unauthorized to update discount coupon' });
      return;
    }

    const { discountId } = req.params;

    // Validate input
    const validatedData = discountCouponSchema.partial().parse({
      ...req.body,
      updatedBy: req.user?.email || 'system'
    });

    // Update discount coupon
    const updatedDiscountCoupon = await prisma.discountCoupon.update({
      where: { id: discountId },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.couponId && { couponId: validatedData.couponId }),
        ...(validatedData.amount && { amount: validatedData.amount }),
        ...(validatedData.amountType && { amountType: validatedData.amountType }),
        ...(validatedData.discountStartDate && { discountStartDate: new Date(validatedData.discountStartDate) }),
        ...(validatedData.discountEndDate && { diacountEndDate: new Date(validatedData.discountEndDate) }),
        ...(validatedData.status && { status: validatedData.status }),
        ...(validatedData.courseIds && { 
          course: {
            set: validatedData.courseIds.map(id => ({ id }))
          }
        }),
        ...(validatedData.customerIds && { 
          customer: {
            set: validatedData.customerIds.map(id => ({ id }))
          }
        })
      }
    });

    res.json({ 
      message: 'Discount coupon updated successfully',
      discountCoupon: {
        id: updatedDiscountCoupon.id,
        name: updatedDiscountCoupon.name,
        couponId: updatedDiscountCoupon.couponId
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    next(error);
  }
};

export const deleteDiscountCoupon = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure only admin can delete discount coupons
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Unauthorized to delete discount coupon' });
      return;
    }

    const { discountId } = req.params;

    // Soft delete (change status to INACTIVE)
    await prisma.discountCoupon.update({
      where: { id: discountId },
      data: { status: 'INACTIVE' }
    });

    res.json({ 
      message: 'Discount coupon deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const listDiscountCoupons = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 10, status = 'ACTIVE' } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const discountCoupons = await prisma.discountCoupon.findMany({
      where: { status: status as 'ACTIVE' | 'INACTIVE' },
      select: {
        id: true,
        name: true,
        couponId: true,
        amount: true,
        amountType: true,
        discountStartDate: true,
        diacountEndDate: true,
        _count: {
          select: { course: true, customer: true }
        }
      },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: {
        createdAt: 'desc'
      }
    });

    const total = await prisma.discountCoupon.count({
      where: { status: status as 'ACTIVE' | 'INACTIVE' }
    });

    res.json({
      discountCoupons: discountCoupons.map((coupon:any) => ({
        ...coupon,
        courseCount: coupon._count.course,
        customerCount: coupon._count.customer
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalDiscountCoupons: total
      }
    });
  } catch (error) {
    next(error);
  }
};