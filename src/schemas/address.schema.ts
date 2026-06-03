import { z } from 'zod';

export const addressSchema = z.object({
  address: z.string().min(5, 'Address must be at least 5 characters'),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().regex(/^\d{6}$/, 'Pin code must be 6 digits'),
  country: z.string().optional()
});

export const updateAddressSchema = z.object({
  id: z.string(), // Add id field
  address: z.string().min(5, 'Address must be at least 5 characters').optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().regex(/^\d{6}$/, 'Pin code must be 6 digits').optional(),
  country: z.string().optional()
});