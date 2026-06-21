import { Response, NextFunction } from 'express';
import { ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
//import fs from 'fs';
import { z } from 'zod';
import { 
  createBlogRequestSchema, 
  updateBlogSchema
} from '../schemas/blog.schema';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';
//import path from 'path';
//import { getImageUrl } from '../middleware/upload.middleware';

type ZodError = z.ZodError<any>;
type ZodIssue = z.ZodIssue;

// Helper function to handle file cleanup
// const cleanupUploadedFile = (filePath: string | undefined): void => {
//   if (filePath) {
//     fs.unlink(filePath, (err: NodeJS.ErrnoException | null) => {
//       if (err) console.error(`Error deleting file: ${filePath}`, err);
//     });
//   }
// };

// Helper to handle validation errors
const handleValidationError = (res: Response, error: unknown): void => {
  if (error instanceof z.ZodError) {
    const errors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message
    }));
    
    res.status(400).json({
      status: 0,
      message: 'Validation failed',
      errors
    });
  } else {
    res.status(400).json({
      status: 0,
      message: 'Invalid request data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const createBlog = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    // Parse and validate the request body
    let bodyData;
    try {
      bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid JSON data in request body',
        error: 'Please provide valid JSON data'
      });
    }

    // Validate request body against schema
    const validationResult = createBlogRequestSchema.safeParse(bodyData);
    if (!validationResult.success) {
      handleValidationError(res, validationResult.error);
      return;
    }

    if (!req.file) {
      return res.status(400).json({
        status: 0,
        message: 'Featured image is required',
        error: 'Please upload a featured image'
      });
    }

    const { data } = validationResult;
    const userId = req.user?.id || 'system';
    //const featuredImage = req.file ? getImageUrl(req.file.filename, 'blog') : '';

    // Check if blog with same title already exists in the same category
    const existingBlog = await prisma.blog.findFirst({
      where: { 
        title: data.title,
        categoryId: data.categoryId,
        status: ActiveStatus.ACTIVE
      }
    });

    if (existingBlog) {
      //cleanupUploadedFile(req.file?.path);
      return res.status(400).json({
        status: 0,
        message: 'Blog with this title already exists in this category',
        error: 'Please choose a different title or category'
      });
    }

    const imageUrl = await uploadToSpaces(
      req.file,
      'images/blog'
    );

    // Create the blog with the uploaded image
    const blog = await prisma.blog.create({
      data: {
        title: data.title,
        authorId: data.authorId,
        categoryId: data.categoryId,
        shortDescription: data.shortDescription,
        longDesription: data.longDescription, // Note: Typo matches Prisma schema
        image: imageUrl,
        featured: data.featured,
        status: data.status,
        createdBy: userId
      },
      include: {
        category: true,
      }
    });

    res.status(201).json({
      status: 1,
      message: 'Blog created successfully',
      data: blog
    });
  } catch (error: any) {
    //cleanupUploadedFile(req.file?.path);
    console.error('Error creating blog:', error);
    
    const errorResponse: any = {
      status: 0,
      message: 'Failed to create blog',
      error: error?.message || 'Internal server error'
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error?.stack;
    }
    
    res.status(500).json(errorResponse);
  }
};

export const updateBlog = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'system';

    // Parse and validate the request body
    let bodyData;
    try {
      bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid JSON data in request body',
        error: 'Please provide valid JSON data'
      });
    }

    // Validate request body against schema
    const validationResult = updateBlogSchema.safeParse(bodyData);
    if (!validationResult.success) {
      handleValidationError(res, validationResult.error);
      return;
    }

    // Check if blog exists
    const existingBlog = await prisma.blog.findUnique({
      where: { id },
    });

    if (!existingBlog) {
      // Clean up uploaded file if blog doesn't exist
      // if (req.file) {
      //   cleanupUploadedFile(req.file.path);
      // }
      return res.status(404).json({
        status: 0,
        message: 'Blog not found',
        error: 'The requested blog does not exist',
      });
    }

    const { data } = validationResult;

    // Prepare update data (Blog has no `updatedBy` column — do not include it)
    void userId;
    const updateData: any = {
      ...data,
    };

    // If a new image was uploaded, update the image field
    if (req.file) {
      // Clean up the associated image file if it exists
      if (existingBlog.image) {
        await deleteFromSpaces(existingBlog.image);
        // Upload new image
      }
      updateData.image = await uploadToSpaces(
          req.file,
          'images/blog'
        );
    }

    // Update the blog
    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });

    res.status(200).json({
      status: 1,
      message: 'Blog updated successfully',
      data: updatedBlog,
    });
  } catch (error: any) {
    //cleanupUploadedFile(req.file?.path);
    console.error('Error updating blog:', error);
    
    const errorResponse: any = {
      status: 0,
      message: 'Failed to update blog',
      error: error?.message || 'Internal server error'
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error?.stack;
    }
    
    res.status(500).json(errorResponse);
  }
};

export const deleteBlog = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const blog = await prisma.blog.findUnique({
      where: { id: id },
    });

    if (!blog) {
      res.status(400).json({
        status: 0,
        message: 'Blog not found'
      });
      return;
    }

    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to delete course'
      });
      return;
    }

    // Delete the course
    await prisma.blog.delete({
      where: { id: id }
    });

    if (blog.image) {
      // const imagePath = path.join(process.cwd(), 'public', author.imageLink);
      // cleanupUploadedFile(imagePath);
      await deleteFromSpaces(blog.image);
    }

    res.json({
      status: 1,
      message: 'Blog deleted successfully',
      data: blog
    });
  } catch (error: any) {
    console.error('Error deleting blog:', error);
    
    const errorResponse: any = {
      status: 0,
      message: 'Failed to delete blog',
      error: error?.message || 'Internal server error'
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error?.stack;
    }
    
    res.status(500).json(errorResponse);
  }
};