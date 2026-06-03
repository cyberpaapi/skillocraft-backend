import { z } from 'zod';
import { ActiveStatus } from '../types';

// Base blog schema without file validation
export const blogBaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  authorId: z.string().min(1, 'Author is required'),
  shortDescription: z.string().min(1, 'Short description is required'),
  longDescription: z.string().min(1, 'Long description is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  featuredImage: z.string().optional(),
  featured: z.union([z.boolean(), z.string().transform(val => val === 'true')]).optional().default(false),
  status: z.nativeEnum(ActiveStatus).optional().default(ActiveStatus.ACTIVE)
});

// Extended schema for creating/updating blogs
export const blogSchema = blogBaseSchema.extend({
  createdBy: z.string().min(1, 'Created by is required')
});

// Define types for TypeScript
export type Blog = z.infer<typeof blogSchema>;
export type CreateBlogInput = Omit<Blog, 'createdBy' | 'featuredImage'> & {
  featuredImage?: Express.Multer.File;
};
export type UpdateBlogInput = Partial<Omit<CreateBlogInput, 'featuredImage'>> & {
  featuredImage?: Express.Multer.File;
};

// Create blog request schema
export const createBlogRequestSchema = blogSchema.omit({ createdBy: true });

// Update blog request schema
export const updateBlogSchema = blogSchema
  .omit({ createdBy: true })
  .partial();

// Blog ID param schema
export const blogIdParamSchema = z.object({
  id: z.string().min(1, 'Blog ID is required')
});

// Blog list query schema
export const blogListQuerySchema = z.object({
  page: z.string().regex(/^\d+$/, 'Page must be a number').default('1'),
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').default('10'),
  status: z.nativeEnum(ActiveStatus).optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(), // For backward compatibility
  featured: z.boolean().optional()
});