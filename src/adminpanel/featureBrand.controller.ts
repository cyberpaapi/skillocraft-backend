import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';
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

export const createFeatureBrand = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let filePath: string | undefined;
  
  try {
    const { brandUrl } = req.body;
    const logoFile = req.file;

    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Validate required fields
    if (!brandUrl || !logoFile) {
      // Clean up uploaded file if validation fails
      // if (logoFile?.path) {
      //   cleanupUploadedFile(logoFile.path);
      // }
      
      res.status(400).json({
        status: 0,
        message: 'Brand URL and logo file are required',
        error: 'Missing required fields'
      });
      return;
    }

    // Store the file path for cleanup in case of error
    //filePath = logoFile.path;

    // Get the public URL for the uploaded file
    //const logoUrl = `/uploads/images/feature-brands/${logoFile.filename}`;
    const imageUrl = await uploadToSpaces(
      logoFile,
      'images/feature-brands'
    );
    
    // Create the feature brand with the file path
    const newBrand = await prisma.featureOn.create({
      data: {
        brandUrl,
        logo: imageUrl,
        status: 'ACTIVE'
      }
    });

    res.status(201).json({
      status: 1,
      message: 'Feature brand created successfully',
      data: newBrand
    });
  } catch (error) {
    console.error('Error creating feature brand:', error);
    
    // Clean up the uploaded file if an error occurs
    // if (filePath) {
    //   cleanupUploadedFile(filePath);
    // }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to create feature brand',
      error: errorMessage
    });
  }
};

export const listFeatureBrands = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const brands = await prisma.featureOn.findMany({
      where: {
        status: 'ACTIVE'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Feature brands retrieved successfully',
      data: brands
    });
  } catch (error) {
    console.error('Error fetching feature brands:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch feature brands',
      error: 'Internal server error'
    });
  }
};

export const getFeatureBrandById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const brand = await prisma.featureOn.findUnique({
      where: { 
        id,
        status: 'ACTIVE'
      }
    });

    if (!brand) {
      res.status(404).json({
        status: 0,
        message: 'Feature brand not found',
        error: 'The requested feature brand does not exist or is inactive'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      message: 'Feature brand retrieved successfully',
      data: brand
    });
  } catch (error) {
    console.error('Error fetching feature brand:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch feature brand',
      error: 'Internal server error'
    });
  }
};

export const updateFeatureBrand = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { brandUrl, logo, status } = req.body;

    // Check if brand exists
    const existingBrand = await prisma.featureOn.findUnique({
      where: { id }
    });

    if (!existingBrand) {
      res.status(404).json({
        status: 0,
        message: 'Feature brand not found',
        error: 'The specified feature brand does not exist'
      });
      return;
    }

    const updatedBrand = await prisma.featureOn.update({
      where: { id },
      data: {
        brandUrl: brandUrl !== undefined ? brandUrl : existingBrand.brandUrl,
        logo: logo !== undefined ? logo : existingBrand.logo,
        status: status !== undefined ? status : existingBrand.status
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Feature brand updated successfully',
      data: updatedBrand
    });
  } catch (error) {
    console.error('Error updating feature brand:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update feature brand',
      error: 'Internal server error'
    });
  }
};

export const deleteFeatureBrand = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if brand exists
    const existingBrand = await prisma.featureOn.findUnique({
      where: { id }
    });

    if (!existingBrand) {
      res.status(404).json({
        status: 0,
        message: 'Feature brand not found',
        error: 'The specified feature brand does not exist'
      });
      return;
    }

    // Soft delete by setting status to INACTIVE
    await prisma.featureOn.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });

    res.status(200).json({
      status: 1,
      message: 'Feature brand deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting feature brand:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to delete feature brand',
      error: 'Internal server error'
    });
  }
};