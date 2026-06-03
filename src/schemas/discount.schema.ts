import { z } from 'zod';

export const discountCouponSchema = z.object({
  name: z.string().min(2, 'Coupon name must be at least 2 characters'),
  couponId: z.string().min(2, 'Coupon ID must be at least 2 characters'),
  amount: z.string(),
  amountType: z.enum(['FIXED', 'PERCENT']), // Update to match Prisma enum
  discountStartDate: z.string().datetime(),
  discountEndDate: z.string().datetime(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  courseIds: z.array(z.string()).optional(),
  customerIds: z.array(z.string()).optional(),
  createdBy: z.string()
});