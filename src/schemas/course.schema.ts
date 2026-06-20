import { z } from 'zod';
import { ActiveStatus } from '../types';

// Base product schema without the file validation
const baseProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  courseId: z.string({ required_error: 'Course ID is required' }),
  videoLink: z.string().url('Invalid video link').optional(),
  description: z.string().optional(),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE)
});

// Schema for creating a product (requires either videoLink or videoFile)
export const productSchema = baseProductSchema.refine(
  (data) => data.videoLink,
  {
    message: 'videoLink is required',
    path: ['videoLink']
  }
);

// Schema for updating a product (all fields optional)
export const updateProductSchema = baseProductSchema.partial();

// Schema for the request body with file upload
export const createProductRequestSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  courseId: z.string({ required_error: 'Course ID is required' }),
  videoLink: z.string().url('Invalid video URL').optional(),
  description: z.string().optional(),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  order: z.number().int().min(1, 'Order must be a positive integer').optional()
});

// Schema for creating a course (used for validation after file upload)
export const courseSchema = z.object({
  name: z.string().min(2, 'Course name must be at least 2 characters'),
  categoryId: z.string({ required_error: 'Category ID is required' }), 
  image: z.string().optional(),
  teaserVideo: z.string().optional(),
  shortDescription: z.string().min(3, 'Short description must be at least 3 characters'),
  longDescription: z.string().min(3, 'Long description must be at least 3 characters'),
  price: z.string().regex(/^\d+(\.\d+)?$/, 'Price must be a valid number'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  createdBy: z.string(),
  creatorId: z.string(),
  pdfLink: z.string().optional(),
  whatsAppLink: z.string().optional(),
  featured: z.union([
  z.boolean(),
  z.string().transform(val => val === 'true' || val === '1')
]).default(false),
  language: z.string().min(3, 'Language name must be at least 3 characters')
});

// Schema for the request with file upload
export const createCourseRequestSchema = z.object({
  name: z.string().min(2, 'Course name must be at least 2 characters'),
  categoryId: z.string({ required_error: 'Category ID is required' }), 
  image: z.any().optional(), // This will be handled by multer
  teaserVideo: z.any().optional(), // This will be handled by multer
  pdfFile: z.any().optional(), // This will be handled by multer
  shortDescription: z.string().min(3, 'Short description must be at least 3 characters'),
  longDescription: z.string().min(3, 'Long description must be at least 3 characters'),
  whatsAppLink: z.string().optional().default('whatsapp://send?phone='),
  price: z.string().regex(/^\d+(\.\d+)?$/, 'Price must be a valid number'),
  discountedPrice: z.string().regex(/^\d+(\.\d+)?$/, 'Discounted price must be a valid number').optional(),
  lectures: z.string().optional(),
  duration: z.string().optional(),
  recommended: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional().default(false),
  creatorId: z.string({ required_error: 'Creator ID is required' }),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE).optional(),
  featured: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).default(false),
  language: z.string().min(3, 'language name must be at least 3 characters')
});