import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
//import fs from 'fs';
//import path from 'path';
import { ActiveStatus, Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { createAuthorRequestSchema } from '../schemas/author.schema';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';

// Extend Express Request type to include file
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
    }
  }
}

// Helper function to handle file cleanup
// const cleanupUploadedFile = (filePath: string | undefined): void => {
//   if (filePath && fs.existsSync(filePath)) {
//     try {
//       fs.unlinkSync(filePath);
//     } catch (error) {
//       console.error('Error cleaning up file:', error);
//     }
//   }
// };

export const createAuthor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Unauthorized' });
      return;
    }

    let imageLink = '';
    if (req.file) {
      imageLink = await uploadToSpaces(req.file, 'images/author');
    }

    const author = await prisma.author.create({
      data: {
        name: req.body.name || 'Unnamed Author',
        description: req.body.description || '',
        imageLink,
        status: ActiveStatus.ACTIVE,
      },
    });

    res.status(201).json({ status: 1, message: 'Author created successfully', data: author });
  } catch (error) {
    next(error);
  }
};

export const updateAuthor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { authorId } = req.params;

  try {
    // Check if course exists with proper typing
    const existingAuthor = await prisma.author.findUnique({
      where: { id: authorId }
    });

    if (!existingAuthor) {
      res.status(400).json({
        status: 0,
        message: 'Author not found'
      });
      return Promise.resolve();
    }

    // Type assertion for the existing course with all fields
    const authorData = existingAuthor as Prisma.AuthorGetPayload<{
    }> & { image?: string; longDesription?: string };



    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to update course'
      });
      return;
    }

    // Handle file upload if new image is provided
    let imageUrl = authorData.imageLink || '';
    if (req.file) {
      // Delete old image if it exists
      // if (authorData.imageLink) {
      //   const oldImagePath = path.join(process.cwd(), 'public', authorData.imageLink);
      //   cleanupUploadedFile(oldImagePath);
      // }
      // imageUrl = `/uploads/images/author/${req.file.filename}`;
      if (authorData.imageLink) {
        await deleteFromSpaces(authorData.imageLink);
      }
      // Upload new image
      imageUrl = await uploadToSpaces(
        req.file,
        'images/author'
      );
    }

    // Prepare update data
    const updateData: Prisma.AuthorUpdateInput = {
      name: req.body.name || authorData.name,
      description: req.body.description || authorData.description,
      imageLink: imageUrl,
      status: (req.body.status as ActiveStatus) || authorData.status,
    };

    // Update course data
    const updatedAuthor = await prisma.author.update({
      where: { id: authorId },
      data: updateData,
    });

    res.json({
      status: 1,
      message: 'Course updated successfully',
      data: updatedAuthor
    });
    return;

  } catch (error) {
    console.error('Error updating course:', error);
    
    // Clean up the uploaded file if there was an error
    // if (req.file?.path) {
    //   cleanupUploadedFile(req.file.path);
    // }
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({
        status: 0,
        message: 'Database error',
        error: error.message
      });
      return;
    } else {
      res.status(500).json({
        status: 0,
        message: 'Internal server error',
        error: 'An unexpected error occurred'
      });
      return;
    }
  }
};

export const deleteAuthor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { authorId } = req.params;

  try {
    // Check if the course exists
    const author = await prisma.author.findUnique({
      where: { id: authorId },
    });

    if (!author) {
      res.status(400).json({
        status: 0,
        message: 'Author not found'
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
    await prisma.author.delete({
      where: { id: authorId }
    });

    // Clean up the course image if it exists
    if (author.imageLink) {
      // const imagePath = path.join(process.cwd(), 'public', author.imageLink);
      // cleanupUploadedFile(imagePath);
      await deleteFromSpaces(author.imageLink);
    }

    res.json({
      status: 1,
      message: 'Author deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Author:', error);
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({
        status: 0,
        message: 'Database error',
        error: error.message
      });
    } else {
      res.status(500).json({
        status: 0,
        message: 'Internal server error',
        error: 'An unexpected error occurred'
      });
    }
  }
};

/**
 * @route   GET /authors
 * @desc    Get all authors
 * @access  Public
 */
export const getAuthors = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authors = await prisma.author.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    if (authors.length === 0) {
      return res.status(200).json({
        status: 1,
        message: 'No data found',
        data: []
      });
    }
    
    res.status(200).json({
      status: 1,
      message: 'Authors retrieved successfully',
      data: authors
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /authors/:id
 * @desc    Get a single author by ID
 * @access  Public
 */
export const getAuthorById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const author = await prisma.author.findUnique({
      where: { id },
    });

    if (!author) {
      return res.status(200).json({
        status: 0,
        message: 'Banner not found',
        data: null
      });
    }

    res.status(200).json({
      status: 1,
      message: 'Data found',
      data: author
    });
  } catch (error) {
    next(error);
  }
};

// Export other controller functions
export * from './author.controller';
