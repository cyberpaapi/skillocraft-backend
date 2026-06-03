import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
//import fs from 'fs';
//import path from 'path';
import { ActiveStatus, Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { createCreatorRequestSchema } from '../schemas/creator.schema';
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

export const createCreator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate required fields
    const requiredFields = ['name', 'description'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      //cleanupUploadedFile(req.file.path);
      res.status(400).json({
        status: 0,
        message: 'Missing required fields',
        error: `The following fields are required: ${missingFields.join(', ')}`,
        fields: missingFields
      });
      return;
    }

    // Ensure user is admin
    if (req.user?.role !== 'ADMIN') {
      //cleanupUploadedFile(req.file.path);
      res.status(403).json({ 
        status: 0,
        message: 'Unauthorized to create course' 
      });
      return;
    }

    // Parse and validate the request body
    const { error: validationError, data: validatedData } = createCreatorRequestSchema.safeParse({
      ...req.body,
      subCategoryId: req.body.subCategoryId === 'undefined' ? undefined : req.body.subCategoryId,
      price: req.body.price ? String(req.body.price) : undefined,
      longDesription: req.body.longDescription || '' // Map longDescription to longDesription
    });

    if (validationError) {
      //cleanupUploadedFile(req.file.path);
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: validationError.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    // Upload image if provided, otherwise use empty string (imageLink is nullable in schema)
    const imageUrl = req.file
      ? await uploadToSpaces(req.file, 'images/creator')
      : '';
    try {
      // Ensure we have a valid user

      console.log('Request body:', JSON.stringify(validatedData, null, 2));
      
      // Create the course with the correct field names from Prisma schema
      const creator = await prisma.creators.create({   
        data: {
          name: validatedData.name,
          designation: validatedData.designation,
          description: validatedData.description,
          imageLink: imageUrl,
          status: ActiveStatus.ACTIVE,
        }
      });

      // Create the response data with proper typing
      const responseData = {
        ...creator,
      };

      res.status(201).json({
        status: 1,
        message: 'Creator created successfully',
        data: responseData
      });
    } catch (error) {
      console.error('Error creating creator:', error);
      
      // Clean up the uploaded file if there was an error
      // if (req.file?.path) {
      //   cleanupUploadedFile(req.file.path);
      // }
      
      if (error instanceof ZodError) {
        res.status(400).json({ 
          status: 0,
          message: 'Validation error',
          errors: error.errors 
        });
      } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(400).json({
          status: 0,
          message: 'Database error',
          error: error.message
        });
      } else {
        res.status(500).json({
          status: 0,
          message: 'Internal server error',
          error: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
      }
    }
  } catch (error) {
    console.error('Unexpected error in createCreator:', error);
    res.status(500).json({
      status: 0,
      message: 'Internal server error',
      error: 'An unexpected error occurred while processing your request'
    });
  }
};

export const updateCreator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { creatorId } = req.params;

  try {
    // Check if course exists with proper typing
    const existingCreator = await prisma.creators.findUnique({
      where: { id: creatorId }
    });

    if (!existingCreator) {
      res.status(400).json({
        status: 0,
        message: 'Creator not found'
      });
      return Promise.resolve();
    }

    // Type assertion for the existing course with all fields
    const creatorData = existingCreator as Prisma.CreatorsGetPayload<{
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
    let imageUrl = creatorData.imageLink || '';
    if (req.file) {
      // Delete old image if it exists
      // if (creatorData.imageLink) {
      //   const oldImagePath = path.join(process.cwd(), 'public', creatorData.imageLink);
      //   cleanupUploadedFile(oldImagePath);
      // }
      // imageUrl = `/uploads/images/creator/${req.file.filename}`;

      if (creatorData.imageLink) {
        await deleteFromSpaces(creatorData.imageLink);
      }
      // Upload new image
      imageUrl = await uploadToSpaces(
        req.file,
        'images/creator'
      );
    }

    // Prepare update data
    const updateData: Prisma.CreatorsUpdateInput = {
      name: req.body.name || creatorData.name,
      description: req.body.description || creatorData.description,
      designation: req.body.designation || creatorData.designation,
      imageLink: imageUrl,
      status: (req.body.status as ActiveStatus) || creatorData.status,
    };

    // Update course data
    const updatedCreator = await prisma.creators.update({
      where: { id: creatorId },
      data: updateData,
    });

    res.json({
      status: 1,
      message: 'Creator updated successfully',
      data: updatedCreator
    });
    return;

  } catch (error) {
    console.error('Error updating creator:', error);
    
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

export const deleteCreator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { creatorId } = req.params;

  try {
    // Check if the course exists
    const creator = await prisma.creators.findUnique({
      where: { id: creatorId },
    });

    if (!creator) {
      res.status(400).json({
        status: 0,
        message: 'Creator not found'
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
    await prisma.creators.delete({
      where: { id: creatorId }
    });

    // Clean up the course image if it exists
    if (creator.imageLink) {
      //const imagePath = path.join(process.cwd(), 'public', creator.imageLink);
      //cleanupUploadedFile(imagePath);
      await deleteFromSpaces(creator.imageLink);

    }

    res.json({
      status: 1,
      message: 'Creator deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Creator:', error);
    
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
 * @route   GET /creators
 * @desc    Get all creators
 * @access  Public
 */
export const getCreators = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const creators = await prisma.creators.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        Course: true,
      }
    });
    
    if (creators.length === 0) {
      return res.status(200).json({
        status: 1,
        message: 'No data found',
        data: []
      });
    }
    
    res.status(200).json({
      status: 1,
      message: 'Creators retrieved successfully',
      data: creators
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /creators/:id
 * @desc    Get a single creator by ID
 * @access  Public
 */
export const getCreatorById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const creator = await prisma.creators.findUnique({
      where: { id },
      include: {
        Course: true,
      }
    });

    if (!creator) {
      return res.status(200).json({
        status: 0,
        message: 'Banner not found',
        data: null
      });
    }

    res.status(200).json({
      status: 1,
      message: 'Data found',
      data: creator
    });
  } catch (error) {
    next(error);
  }
};

// Export other controller functions
export * from './creator.controller';
