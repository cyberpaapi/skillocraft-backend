import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadFile } from '../utils/uploadFile';

/**
 * @route   GET /api/banners
 * @desc    Get all banners
 * @access  Public
 */
export const getBanners = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    if (banners.length === 0) {
      return res.status(200).json({
        status: 1,
        message: 'No data found',
        data: []
      });
    }
    
    res.status(200).json({
      status: 1,
      message: 'Banners retrieved successfully',
      data: banners
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/banners/:id
 * @desc    Get a single banner by ID
 * @access  Public
 */
export const getBannerById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const banner = await prisma.banner.findUnique({
      where: { id },
    });

    if (!banner) {
      return res.status(200).json({
        status: 0,
        message: 'Banner not found',
        data: null
      });
    }

    res.status(200).json({
      status: 1,
      message: 'Data found',
      data: banner
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/banners
 * @desc    Create a new banner
 * @access  Private/Admin
 */
export const createBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, bannerLocation } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Banner image is required' });
    }

    const imageUrl = await uploadFile(req.file, 'skillocraft/banners', 'images/banner', 'image');

    const banner = await prisma.banner.create({
      data: {
        name,
        imageLink: imageUrl,
        description,
        bannerLocation,
      },
    });

    res.status(201).json({
      status: 1,
      message: 'Banner created successfully',
      data: {
        ...banner
      }
    });
  } catch (error) {
    // Clean up uploaded file if there was an error
    if (req.file) {
      deleteBannerImage(req.file.filename);
    }
    next(error);
  }
};

/**
 * @route   PUT /api/banners/:id
 * @desc    Update a banner
 * @access  Private/Admin
 */
export const updateBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, bannerLocation, status } = req.body;

    // Check if banner exists
    const existingBanner = await prisma.banner.findUnique({
      where: { id },
    });

    if (!existingBanner) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const updateData: any = {
      name,
      description,
      bannerLocation,
      status,
    };

    // If new image is uploaded, update the image link and delete the old one
    if (req.file) {
      updateData.imageLink = await uploadFile(req.file, 'skillocraft/banners', 'images/banner', 'image');
    }

    const banner = await prisma.banner.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      ...banner,
      // Return full URL if needed
      imageUrl: banner.imageLink ? `${process.env.APP_URL || ''}${banner.imageLink}` : null
    });
  } catch (error) {
    // Clean up uploaded file if there was an error
    if (req.file) {
      deleteBannerImage(req.file.filename);
    }
    next(error);
  }
};

/**
 * @route   DELETE /api/banners/:id
 * @desc    Delete a banner
 * @access  Private/Admin
 */
export const deleteBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if banner exists
    const existingBanner = await prisma.banner.findUnique({
      where: { id },
    });

    if (!existingBanner) {
      return res.status(400).json({
        status: 0,
        message: 'Banner not found'
      });
    }

    await prisma.banner.delete({
      where: { id },
    });

    res.status(200).json({
      status: 1,
      message: 'Banner deleted successfully' });
  } catch (error) {
    next(error);
  }
};
