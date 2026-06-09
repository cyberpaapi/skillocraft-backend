import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { 
  categorySchema,  
  categoryResponseSchema,
  categoriesListResponseSchema,
  apiErrorResponseSchema 
} from '../schemas/admin.schema';
import { AuthRequest, ActiveStatus } from '../types';
import { uploadFile } from '../utils/uploadFile';

export const updateCategory = async (
  req: AuthRequest & {
    files?: {
      image?: Express.Multer.File[],
      icon?: Express.Multer.File[]
    };
    params: { id: string };
    body: {
      name?: string;
      description?: string;
      parentId?: string | null;
      featured?: boolean;
      status?: 'ACTIVE' | 'INACTIVE';
      imageUrl?: string;
      icon?: string;
    };
  },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true }
    });

    if (!existingCategory) {
      res.status(404).json({
        status: 0,
        message: 'Category not found'
      });
      return;
    }

    // Handle file uploads using memoryStorage buffers
    let imageUrl = existingCategory.imageUrl;
    let iconUrl = existingCategory.icon;

    const { uploadFile } = await import('../utils/uploadFile');

    if (req.files?.image?.[0]) {
      imageUrl = await uploadFile(req.files.image[0], 'skillocraft/images/categories', 'images/categories', 'image');
    }

    if (req.files?.icon?.[0]) {
      iconUrl = await uploadFile(req.files.icon[0], 'skillocraft/images/icons', 'images/icons', 'image');
    }

    // Build update payload from body — skip strict Zod for partial updates
    const { name, description, status, featured, parentId } = req.body;
    const updatePayload: Record<string, unknown> = {
      imageUrl,
      icon: iconUrl,
    };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (status !== undefined) updatePayload.status = status;
    if (featured !== undefined) updatePayload.featured = featured === 'true' || featured === true;
    if (parentId !== undefined) updatePayload.parentId = parentId || null;

    // Update the category
    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updatePayload as any,
      include: {
        parent: {
          select: { id: true, name: true }
        },
        _count: {
          select: { children: true }
        }
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Category updated successfully',
      data: updatedCategory
    });

  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: error.errors
      });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        res.status(400).json({
          status: 0,
          message: 'Category with this name already exists'
        });
      } else {
        next(error);
      }
    } else {
      next(error);
    }
  }
};

export const createCategory = async (
  req: AuthRequest & { 
    files?: { 
      image?: Express.Multer.File[], 
      icon?: Express.Multer.File[] 
    };
    body: { 
      name: string; 
      description?: string; 
      parentId?: string; 
      featured: boolean;
      status?: 'ACTIVE' | 'INACTIVE';
      imageUrl?: string;
      icon?: string;
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
    const files = req.files;

    const saveFile = async (file: Express.Multer.File, folder: string, localSubdir: string): Promise<string> =>
      uploadFile(file, folder, localSubdir, 'image');

    // Upload image if provided (optional)
    const imageUrl = files?.image?.[0]
      ? await saveFile(files.image[0], 'images/categories', 'images/categories')
      : '';

    // Upload icon if provided (optional)
    const iconUrl = files?.icon?.[0]
      ? await saveFile(files.icon[0], 'images/icons', 'images/icons')
      : '';

    // Prepare validation data
    const validationData = {
      name: req.body.name,
      description: req.body.description,
      status: req.body.status || 'ACTIVE',
      parentId: req.body.parentId || null,
      featured: req.body.featured || false,
      createdBy: userEmail
    };
    
    // Validate the input data
    try {
      const validationResult = categorySchema.safeParse(validationData);

      if (!validationResult.success) {
        // No cleanup needed for memory storage
        
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
        // No cleanup needed for memory storage
        
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

    // Check if parent category exists if parentId is provided
    if (validationData.parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: validationData.parentId }
      });

      if (!parentCategory) {
        // No cleanup needed for memory storage
        
        res.status(404).json({
          status: 0,
          message: 'Parent category not found'
        });
        return;
      }
    }

    const featured = typeof validationData.featured === 'string' 
  ? validationData.featured === 'true' || validationData.featured === '1'
  : Boolean(validationData.featured);

    // Create the category with the processed file URLs
    const category = await prisma.category.create({
      data: {
        name: validationData.name,
        description: validationData.description || '',
        imageUrl,
        icon: iconUrl,
        featured: featured,
        status: validationData.status as ActiveStatus,
        parentId: validationData.parentId,
        createdBy: validationData.createdBy
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            status: true
          }
        },
        children: {
          where: {
            status: 'ACTIVE'
          },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            icon: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    // Transform the response to match the desired format
    const responseData = {
      ...category,
      subCategory: category.children || []
    };

    res.status(201).json({
      status: 1,
      message: 'Category created successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error creating category:', error);
    
    // No cleanup needed for memory storage
    
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
export const listCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status } = req.query;
    
    // Build the where clause based on query parameters
    const where: Prisma.CategoryWhereInput = {
      parentId: null // Only get top-level categories
    };
    
    if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
      where.status = status as ActiveStatus;
    } else {
      where.status = 'ACTIVE'; // Default to active categories
    }
    
    // Fetch categories with their subcategories
    const categories = await prisma.category.findMany({
      where,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true
          }
        },
        children: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            featured: true,
            icon: true,
            parentId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true
          },
          orderBy: { name: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    if (categories.length === 0) {
      res.status(200).json({
        status: 1,
        message: 'No categories found',
        data: []
      });
      return;
    }
    
    // Transform and validate the response data
    const responseData = categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description || '',
      imageUrl: category.imageUrl,
      icon: category.icon,
      featured: category.featured,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      subCategory: category.children ? category.children.map(child => ({
        id: child.id,
        name: child.name,
        description: child.description || '',
        imageUrl: child.imageUrl,
        icon: child.icon,
        featured: child.featured,
        status: child.status,
        parentId: child.parentId,
        createdAt: child.createdAt,
        updatedAt: child.updatedAt,
        createdBy: child.createdBy
      })) : []
    }));
    
    // Validate against the response schema
    const validatedResponse = categoriesListResponseSchema.parse(responseData);
    
    res.status(200).json({
      status: 1,
      message: 'Data found',
      data: validatedResponse
    });
  } catch (error) {
    console.error('Error listing categories:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// Get category by ID with children and parent details
export const getCategoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Get the category with all necessary fields including timestamps and createdBy
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            status: true,
            featured: true,
            createdBy: true,
            createdAt: true,
            updatedAt: true
          }
        },
        children: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            icon: true,
            featured: true,
            parentId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true
          },
          orderBy: { name: 'asc' }
        }
      }
    });

    if (!category) {
      const errorResponse = apiErrorResponseSchema(404).parse({
        status: 0,
        message: 'Category not found',
        statusCode: 404
      });
      res.status(404).json(errorResponse);
      return;
    }

    // Prepare and validate the response
    const responseData = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      imageUrl: category.imageUrl,
      icon: category.icon,
      featured: category.featured,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      parentId: category.parentId,
      subCategory: category.children ? category.children.map(child => ({
        id: child.id,
        name: child.name,
        description: child.description || '',
        imageUrl: child.imageUrl,
        icon: child.icon,
        featured: child.featured,
        status: child.status,
        parentId: child.parentId,
        createdAt: child.createdAt,
        updatedAt: child.updatedAt,
        createdBy: child.createdBy
      })) : []
    };
    
    // Validate against the response schema
    const validatedData = categoryResponseSchema.parse(responseData);
    
    // Return the validated category data
    res.status(200).json({
      status: 1,
      message: 'Category retrieved successfully',
      data: validatedData
    });
  } catch (error) {
    console.error('Error getting category:', error);
    
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

export const deleteCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { categoryId } = req.params;

  try {
    // Check if the category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true }
    });

    if (!category) {
      res.status(404).json({
        status: 0,
        message: 'Category not found'
      });
      return;
    }

    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to delete category'
      });
      return;
    }

    // Delete the category
    await prisma.category.delete({
      where: { id: categoryId }
    });

    // Clean up the category image if it exists
    if (category.imageUrl) {
      const imagePath = path.join(process.cwd(), 'public', category.imageUrl);
      cleanupUploadedFile(imagePath);
    }

    res.json({
      status: 1,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    
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
const cleanupUploadedFile = (filePath: string | undefined): void => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }
};