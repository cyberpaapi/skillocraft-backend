import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadVideo, generatePublicUrl, deleteFile } from './upload.middleware';
import { promisify } from 'util';
import fs from 'fs';
import { getVideoDurationFromUrl, formatDuration } from '../utils/video-utils';

const unlinkAsync = promisify(fs.unlink);

export const getProductDetails = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        course: {
          include: {
            creator: true, 
            product:true
          },
        },
      }
    });

    if (!product) {
      res.status(200).json({ 
        status: 0,
        message: 'Product not found' 
      });
      return;
    }

    // Get video duration for the main product
    let duration = 0;
    let formattedDuration = '00:00:00';
    
    if (product.videoLink) {
      try {
        duration = await getVideoDurationFromUrl(product.videoLink);
        formattedDuration = formatDuration(duration);
      } catch (error) {
        console.error(`Error getting duration for product ${product.id}:`, error);
        duration = 0;
        formattedDuration = '00:00:00';
      }
    }

    // Get video durations for all products in the course
    const productsWithDuration = await Promise.all(
      product.course.product.map(async (p) => {
        let productDuration = 0;
        let productFormattedDuration = '00:00:00';
        
        if (p.videoLink) {
          try {
            productDuration = await getVideoDurationFromUrl(p.videoLink);
            productFormattedDuration = formatDuration(productDuration);
          } catch (error) {
            console.error(`Error getting duration for course product ${p.id}:`, error);
            productDuration = 0;
            productFormattedDuration = '00:00:00';
          }
        }
        
        return {
          ...p,
          duration: productDuration,
          formattedDuration: productFormattedDuration
        };
      })
    );

    // Map the product data to match the desired response format
    const responseData = {
      status: 1,
      message: 'Data found',
      product: {
        id: product.id,
        name: product.name,
        description: product.discription,  // Note: The field is 'discription' in the database
        videoLink: product.videoLink,
        duration, // Video duration in seconds
        formattedDuration, // Formatted duration (HH:MM:SS)
        status: product.status,
        course: {
          id: product.course.id,
          name: product.course.name,
          shortDescription: product.course.shortDescription,
          creator: product.course.creator,
          pdfLink: product.course.pdfLink,
          whatsAppLink: product.course.whatsAppLink,
          featured: product.course.featured,
          language: product.course.language,
          product: productsWithDuration.map(p => ({
            id: p.id,
            name: p.name,
            discription: p.discription,
            videoLink: p.videoLink,
            duration: p.duration, // Video duration in seconds
            formattedDuration: p.formattedDuration, // Formatted duration (HH:MM:SS)
            status: p.status,
            createdBy: p.createdBy,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          })),
        }
      }
    };

    res.status(200).json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/products/:productId/upload-video
 * @desc    Upload a video for a product
 * @access  Private/Admin
 */
export const uploadProductVideo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Handle file upload
    uploadVideo(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      try {
        // Delete old video if exists
        if (product.videoLink) {
          try {
            deleteFile(product.videoLink);
          } catch (error) {
            console.error('Error deleting old video:', error);
            // Continue even if deletion of old video fails
          }
        }

        // Generate public URL for the new video
        const publicUrl = generatePublicUrl(req.file.filename);

        // Update product with new video link
        const updatedProduct = await prisma.product.update({
          where: { id: productId },
          data: {
            videoLink: publicUrl,
          },
        });

        res.status(200).json({
          message: 'Video uploaded successfully',
          videoUrl: publicUrl,
          product: updatedProduct,
        });
      } catch (error) {
        // Clean up uploaded file if there was an error
        if (req.file) {
          try {
            await unlinkAsync(req.file.path);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/products/:productId/video
 * @desc    Delete a product's video
 * @access  Private/Admin
 */
export const deleteProductVideo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    if (!product.videoLink) {
      res.status(400).json({ error: 'No video found for this product' });
      return;
    }

    try {
      // Delete the video file
      deleteFile(product.videoLink);

      // Update product to remove video link by setting it to an empty string
      await prisma.product.update({
        where: { id: productId },
        data: {
          videoLink: '', // Set to empty string instead of null
        },
      });

      res.status(200).json({ message: 'Video deleted successfully' });
    } catch (error) {
      console.error('Error deleting video:', error);
      throw new Error('Failed to delete video');
    }
  } catch (error) {
    next(error);
  }
};