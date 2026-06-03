import { z } from 'zod';

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(8, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).+$/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Base schema with common fields
const baseRegisterSchema = {
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()]/, 'Password must contain at least one special character'),
  name: z.string(),
  contact: z.string()
    .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid contact number')
};

// Schema for staff registration
const staffRegisterSchema = z.object({
  ...baseRegisterSchema,
  role: z.literal('STAFF'),
  roleId: z.string().uuid('Invalid role ID format')
});

// Schema for non-staff registration
const nonStaffRegisterSchema = z.object({
  ...baseRegisterSchema,
  role: z.enum(['CUSTOMER', 'ADMIN'])
});

// Combined schema with conditional validation
export const registerSchema = z.union([staffRegisterSchema, nonStaffRegisterSchema]);

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});