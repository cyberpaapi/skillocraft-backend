import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';
//import fs from 'fs';
//import path from 'path';

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

export const createFeatureGallery = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let filePath: string | undefined;
  
  try {
    const { description } = req.body;
    const imageFile = req.file;
    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Validate required fields
    if (!imageFile) {
      res.status(400).json({
        status: 0,
        message: 'Image file is required',
        error: 'Missing required field: image'
      });
      return;
    }

    // Store the file path for cleanup in case of error
    //filePath = imageFile.path;
    //const imageUrl = `/uploads/images/feature-gallery/${imageFile.filename}`;
    const imageUrl = await uploadToSpaces(
      imageFile,
      'images/feature-gallery'
    );
    const newGallery = await prisma.featureGallery.create({
      data: {
        imageLink: imageUrl,
        description: description || null,
        status: 'ACTIVE' as ActiveStatus
      }
    });

    res.status(201).json({
      status: 1,
      message: 'Feature gallery created successfully',
      data: newGallery
    });
  } catch (error) {
    console.error('Error creating feature gallery:', error);
    
    // Clean up the uploaded file if an error occurs
    // if (filePath) {
    //   cleanupUploadedFile(filePath);
    // }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to create feature gallery',
      error: errorMessage
    });
  }
};

export const listFeatureGalleries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const galleries = await prisma.featureGallery.findMany({
      where: {
        status: 'ACTIVE'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Gallery items retrieved successfully',
      data: galleries
    });
  } catch (error) {
    console.error('Error fetching gallery items:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch gallery items',
      error: 'Internal server error'
    });
  }
};

export const getFeatureGalleryById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const galleryItem = await prisma.featureGallery.findUnique({
      where: { 
        id,
        status: 'ACTIVE'
      }
    });

    if (!galleryItem) {
      res.status(404).json({
        status: 0,
        message: 'Gallery item not found',
        error: 'The requested gallery item does not exist or is inactive'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      message: 'Gallery item retrieved successfully',
      data: galleryItem
    });
  } catch (error) {
    console.error('Error fetching gallery item:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch gallery item',
      error: 'Internal server error'
    });
  }
};

export const updateFeatureGallery = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let filePath: string | undefined;
  
  try {
    const { id } = req.params;
    const { description, status } = req.body;
    const imageFile = req.file;

    // Check if gallery exists
    const existingGallery = await prisma.featureGallery.findUnique({
      where: { id }
    });

    if (!existingGallery) {
      res.status(404).json({
        status: 0,
        message: 'Feature gallery not found'
      });
      return;
    }

    // Store the old image path for cleanup if a new file is uploaded
    let oldImagePath: string | null = null;
    
    // Prepare update data
    const updateData: any = {
      description: description !== undefined ? description : existingGallery.description,
      status: status !== undefined ? status : existingGallery.status
    };

    // If a new image is uploaded
    if (imageFile) {
      //filePath = imageFile.path;
      //updateData.imageLink = `/uploads/images/feature-gallery/${imageFile.filename}`;
      
      // Get the old image path for cleanup
      // const oldImageUrl = existingGallery.imageLink;
      // if (oldImageUrl) {
      //   const filename = oldImageUrl.split('/').pop();
      //   oldImagePath = path.join('uploads', 'images', 'feature-gallery', filename || '');
      // }
      if (existingGallery.imageLink) {
        await deleteFromSpaces(existingGallery.imageLink);
      }
      // Upload new image
      updateData.imageLink = await uploadToSpaces(
        imageFile,
        'images/feature-gallery'
      );
    }

    const updatedGallery = await prisma.featureGallery.update({
      where: { id },
      data: updateData
    });

    // Clean up the old image if a new one was uploaded
    // if (oldImagePath) {
    //   cleanupUploadedFile(oldImagePath);
    // }

    res.status(200).json({
      status: 1,
      message: 'Feature gallery updated successfully',
      data: updatedGallery
    });
  } catch (error) {
    console.error('Error updating feature gallery:', error);
    
    // Clean up the uploaded file if an error occurs
    // if (filePath) {
    //   cleanupUploadedFile(filePath);
    // }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to update feature gallery',
      error: errorMessage
    });
  }
};

export const deleteFeatureGallery = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if gallery exists
    const existingGallery = await prisma.featureGallery.findUnique({
      where: { id }
    });

    if (!existingGallery) {
      res.status(404).json({
        status: 0,
        message: 'Feature gallery not found'
      });
      return;
    }

    // Get the image path for cleanup
    const imageUrl = existingGallery.imageLink;
    //let imagePath: string | null = null;
    
    if (imageUrl) {
      // const filename = imageUrl.split('/').pop();
      // imagePath = path.join('uploads', 'images', 'feature-gallery', filename || '');
      await deleteFromSpaces(existingGallery.imageLink);
    }

    // Delete the gallery record
    await prisma.featureGallery.delete({
      where: { id }
    });

    // Clean up the associated image file
    // if (imagePath) {
    //   cleanupUploadedFile(imagePath);
    // }

    res.status(200).json({
      status: 1,
      message: 'Feature gallery deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting feature gallery:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to delete feature gallery',
      error: errorMessage
    });
  }
};