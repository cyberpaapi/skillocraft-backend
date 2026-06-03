import { z } from 'zod';
import { ActiveStatus } from '../types';

// Schema for creating a course (used for validation after file upload)
export const successStorySchema = z.object({
  name: z.string().min(2, 'Creator name must be at least 2 characters'),
  imageLink: z.string().optional(),
  description: z.string().min(10, 'Short description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  createdBy: z.string(),
  brand: z.string(),
  earning:z.string()
});

// Schema for the request with file upload
export const createSuccessStoryRequestSchema = z.object({
  name: z.string().min(2, 'Creator name must be at least 2 characters'),
  image: z.any().optional(), // This will be handled by multer
  description: z.string().min(10, 'Short description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  brand: z.string(),
  earning:z.string()
});