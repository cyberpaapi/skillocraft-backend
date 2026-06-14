import { Request, Response, NextFunction } from 'express';
//import fs from 'fs';
//import path from 'path';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { 
  categorySchema,  
  apiErrorResponseSchema 
} from '../schemas/admin.schema';
import { AuthRequest, ActiveStatus } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';

export const createSuccessStory = async (
  req: AuthRequest & { 
    files?: { 
      image?: Express.Multer.File[], 
      coverPhoto?: Express.Multer.File[] 
    };
    body: { 
      name: string; 
      description: string; 
      brand: string; 
      earning: string;
      categoryId: string;
      status?: 'ACTIVE' | 'INACTIVE';
      imageUrl?: string;
      coverPhoto?: string;
    };
  },
  res: Response,
  next: NextFunction
): Promise<void> => {
  // First, verify the user is authenticated
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(401).json({
      status: 0,
      message: 'Authentication required'
    });
    return;
  }

  try {
    // Get the uploaded files from the request
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    // Debug log to check the uploaded files
    console.log('Uploaded files:', files);
    
    if (!files?.image?.[0] || !files?.coverPhoto?.[0]) {
      // Clean up any uploaded files if one is missing
      // if (files?.image?.[0]?.path) await fs.promises.unlink(files.image[0].path).catch(console.error);
      // if (files?.coverPhoto?.[0]?.path) await fs.promises.unlink(files.coverPhoto[0].path).catch(console.error);
      
      res.status(400).json({
        status: 0,
        message: 'Both image and coverPhoto files are required',
        receivedFiles: Object.keys(files || {})
      });
      return;
    }

    // Construct file URLs
    // const imageUrl = `/uploads/images/success/${path.basename(files.image[0].path)}`;
    // const coverImageUrl = `/uploads/images/success/${path.basename(files.coverPhoto[0].path)}`;


    // Prepare validation data
    const validationData = {
      name: req.body.name,
      description: req.body.description,
      brand: req.body.brand,
      earning: req.body.earning,
      status: req.body.status || 'ACTIVE',
      parentId: req.body.parentId || null,
      categoryId: req.body.categoryId
    };
    
    // Validate the input data
    try {
      const validationResult = categorySchema.safeParse(validationData);

      if (!validationResult.success) {
        // Clean up uploaded files if validation fails
        // await Promise.all([
        //   files.image?.[0]?.path ? fs.promises.unlink(files.image[0].path).catch(console.error) : Promise.resolve(),
        //   files.coverPhoto?.[0]?.path ? fs.promises.unlink(files.coverPhoto[0].path).catch(console.error) : Promise.resolve()
        // ]);
        
        const errorMessages = validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        res.status(400).json({
          status: 0,
          message: 'Validation error',
          errors: errorMessages
        });
        return;
      }
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        // Clean up uploaded files if validation fails
        // await Promise.all([
        //   files.image?.[0]?.path ? fs.promises.unlink(files.image[0].path).catch(console.error) : Promise.resolve(),
        //   files.coverPhoto?.[0]?.path ? fs.promises.unlink(files.coverPhoto[0].path).catch(console.error) : Promise.resolve()
        // ]);
        
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
      throw validationError;
    }

    const imageUrl = await uploadToSpaces(
      files.image[0],
      'images/success'
    );

    const coverImageUrl = await uploadToSpaces(
      files.coverPhoto[0],
      'images/success'
    );

    // Create the successStory with the processed file URLs
    const successStory = await prisma.successStory.create({
      data: {
        name: validationData.name,
        description: validationData.description || '',
        imageLink: imageUrl,
        coverPhoto: coverImageUrl,
        status: validationData.status as ActiveStatus,
        brand: validationData.brand,
        earning: validationData.earning,
        categoryId: validationData.categoryId,
      }
    });

    // Transform the response to match the desired format
    const responseData = {
      ...successStory,
    };

    res.status(201).json({
      status: 1,
      message: 'Success Story created successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error creating success story:', error);
    
    // Clean up any uploaded files if there was an error
    // if (req.files) {
    //   await Promise.all([
    //     req.files.image?.[0]?.path ? fs.promises.unlink(req.files.image[0].path).catch(console.error) : Promise.resolve(),
    //     req.files.coverPhoto?.[0]?.path ? fs.promises.unlink(req.files.coverPhoto[0].path).catch(console.error) : Promise.resolve()
    //   ]);
    // }
    
    if (error instanceof ZodError) {
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          field: err.path.join('.'),
          message: err.message
        }))
      });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({
        status: 0,
        message: 'Database error',
        error: error.message
      });
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        status: 0,
        message: 'Internal server error',
        error: errorMessage
      });
    }
  }
};

// List all categories with optional filtering
export const listSuccessStory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Fetch categories with their subcategories
    const successStory = await prisma.successStory.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            icon:true
          }
        },
      },
      orderBy: { name: 'asc' }
    });
    
    if (successStory.length === 0) {
      res.status(200).json({
        status: 1,
        message: 'No Success Story found',
        data: {
          category_data: []
        }
      });
      return;
    }
    
    // Transform and validate the response data
    const responseData =
      successStory.map(successStory => ({
        id: successStory.id,
        name: successStory.name,
        description: successStory.description || '',
        brand: successStory.brand,
        earning: successStory.earning,
        imageLink: successStory.imageLink,
        coverPhoto: successStory.coverPhoto,
        status: successStory.status,
        createdAt: successStory.createdAt,
        category: successStory.category
      }));
    
    // Validate against the response schema
    //const validatedResponse = successStoryResponseSchema.parse(responseData);
    
    res.status(200).json({
      status: 1,
      message: 'Data found',
      data: responseData
    });
  } catch (error) {
    console.error('Error listing success story:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch success story',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Get success story by ID with children and parent details
export const getSuccessStoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { successId } = req.params;
    
    if (!successId) {
      const errorResponse = apiErrorResponseSchema(400).parse({
        status: 0,
        message: 'Success story ID is required',
        statusCode: 400
      });
      res.status(400).json(errorResponse);
      return;
    }
    
    // Get the success story with its category
    const successStory = await prisma.successStory.findUnique({
      where: { id: successId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            icon: true,
            status: true
          }
        }
      }
    });

    if (!successStory) {
      const errorResponse = apiErrorResponseSchema(400).parse({
        status: 0,
        message: 'Success Story not found',
      });
      res.status(404).json(errorResponse);
      return;
    }

    // Prepare and validate the response
    const responseData = {
      ...successStory,
      category: successStory.category
    };
    
    // Validate against the response schema
    //const validatedData = successStoryResponseSchema.parse(responseData);
    
    // Return the validated success story data
    res.status(200).json({
      status: 1,
      message: 'Success Story retrieved successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error getting success story:', error);
    
    if (error instanceof ZodError) {
      const validationError = apiErrorResponseSchema(400).parse({
        status: 0,
        message: 'Validation error',
        statusCode: 400,
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      res.status(400).json(validationError);
    } else {
      const errorResponse = apiErrorResponseSchema(500).parse({
        status: 0,
        message: 'Internal server error',
        statusCode: 500,
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
      res.status(500).json(errorResponse);
    }
  }
};

export const deleteSuccessStory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { successStoryId } = req.params;

  try {
    // Check if the success story exists
    const successStory = await prisma.successStory.findUnique({
      where: { id: successStoryId }
    });

    if (!successStory) {
      res.status(400).json({
        status: 0,
        message: 'Success Story not found'
      });
      return;
    }

    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to delete success story'
      });
      return;
    }

    // Clean up the success story image if it exists
    if (successStory.imageLink) {
      // const imagePath = path.join(process.cwd(), 'public', successStory.imageLink);
      // cleanupUploadedFile(imagePath);
      await deleteFromSpaces(successStory.imageLink);

    }
    if (successStory.coverPhoto) {
        //const imagePath = path.join(process.cwd(), 'public', successStory.coverPhoto);
        await deleteFromSpaces(successStory.coverPhoto);
    }

    // Delete the success story
    await prisma.successStory.delete({
      where: { id: successStoryId }
    });

    res.json({
      status: 1,
      message: 'Success Story deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting success story:', error);
    
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