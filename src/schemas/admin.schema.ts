import { z } from 'zod';

// Base response schema
export const baseResponseSchema = z.object({
  status: z.number().int().min(0).max(1),
  message: z.string()
});

// Success response with data
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => 
  baseResponseSchema.extend({
    status: z.literal(1),
    message: z.string().default('Success'),
    data: dataSchema.optional()
  });

// Schema for creating/updating a category
export const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters'),
  description: z.string().optional().default(''),
  // For file uploads, we'll handle the file in the controller
  // and store the path/URL in the database
  image: z.any().optional(),
  icon: z.any().optional(),
  featured: z.union([
  z.boolean(),
  z.string().transform(val => val === 'true' || val === '1')
]).default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  parentId: z.string().uuid('Invalid parent category ID').nullable().optional(),
  createdBy: z.string().optional()
});

// Schema for subcategory response
export const subCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().nullable(),
  icon: z.string().nullable(),
  featured: z.union([
  z.boolean(),
  z.string().transform(val => val === 'true' || val === '1')
]).default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  parentId: z.string().uuid().nullable(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date())
});

// Schema for category response
export const categoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().nullable(),
  icon: z.string().nullable(),
  featured: z.boolean().optional().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().or(z.date()).transform(val => val instanceof Date ? val.toISOString() : val),
  updatedAt: z.string().or(z.date()).transform(val => val instanceof Date ? val.toISOString() : val),
  createdBy: z.string().optional().nullable(),
  subCategory: z.array(subCategoryResponseSchema).optional()
});

// Schema for categories list response
export const categoriesListResponseSchema = z.array(categoryResponseSchema);

// Success response for categories list
export const categoriesListSuccessResponse = successResponseSchema(categoriesListResponseSchema);

// Error response
export const errorResponseSchema = baseResponseSchema.extend({
  status: z.literal(0),
  message: z.string(),
  errors: z.record(z.string()).optional()
});

// Category details response
export const categoryDetailsResponseSchema = successResponseSchema(
  categoryResponseSchema
);

// Categories tree response
export const categoriesTreeResponseSchema = successResponseSchema(
  z.array(categoryResponseSchema.extend({
    children: z.array(categoryResponseSchema.partial())
  }))
);

// No data response for categories
export const noDataResponseSchema = baseResponseSchema.extend({
  status: z.literal(0),
  message: z.literal('No data found'),
  data: z.array(z.never()).length(0).default([])
});

// No data response for subcategories
export const noSubcategoryDataResponseSchema = baseResponseSchema.extend({
  status: z.literal(0),
  message: z.string(), // Changed from literal to string to allow more flexible messages
  data: z.array(z.never()).length(0).default([])
});

// Error response with status code
export const apiErrorResponseSchema = (statusCode: number) => 
  baseResponseSchema.extend({
    status: z.literal(0),
    message: z.string(),
    statusCode: z.literal(statusCode)
  });