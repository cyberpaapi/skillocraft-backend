import { z } from 'zod';

export const createOrderSchema = z.object({
    cartIds: z.array(z.string().uuid()).min(1, "At least one cart item is required"),
    discountCode: z.string().optional(),
    totalAmount: z.string().min(1, "Total amount is required"),
    payableAmount: z.string().min(1, "Payable amount is required"),
    transactionId: z.string().min(1, "Transaction ID is required"),
    paymentType: z.enum(['CREDITCARD', 'DEBITCARD', 'UPI', 'NETBANKING', 'WALLET','ONLINE'] as const)
  });