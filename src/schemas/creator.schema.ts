import { z } from 'zod';
import { ActiveStatus } from '../types';

// Schema for creating a course (used for validation after file upload)
export const creatorSchema = z.object({
  name: z.string().min(2, 'Creator name must be at least 2 characters'),
  image: z.string().optional(),
  designation: z.string(),
  description: z.string().min(10, 'Short description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  createdBy: z.string()
});

// Schema for the request with file upload
export const createCreatorRequestSchema = z.object({
  name: z.string().min(2, 'Creator name must be at least 2 characters'),
  image: z.any().optional(), // This will be handled by multer
  designation: z.string(),
  description: z.string().min(10, 'Short description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE)
});