import { z } from 'zod';
import { ActiveStatus } from '../types';

// Schema for creating a course (used for validation after file upload)
export const authorSchema = z.object({
  name: z.string().min(2, 'Course name must be at least 2 characters'),
  image: z.string().optional(),
  description: z.string().min(10, 'description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE),
  createdBy: z.string()
});

// Schema for the request with file upload
export const createAuthorRequestSchema = z.object({
  name: z.string().min(2, 'Course name must be at least 2 characters'),
  image: z.any().optional(), // This will be handled by multer
  description: z.string().min(10, 'description must be at least 10 characters'),
  status: z.nativeEnum(ActiveStatus).default(ActiveStatus.ACTIVE)
});