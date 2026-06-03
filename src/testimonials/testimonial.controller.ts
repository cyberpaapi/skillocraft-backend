import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { generateTestimonialUrl, deleteTestimonialImage } from './upload.middleware';

/**
 * @route   GET /api/testimonials
 * @desc    Get all testimonials
 * @access  Public
 */
export const getTestimonials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const testimonials = await prisma.testimonials.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    // Append full URL to image links and format response
    const data = testimonials.map(testimonial => ({
      ...testimonial
    }));

    res.status(200).json({
      status: 1,
      message: 'Testimonials retrieved successfully',
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/testimonials/:id
 * @desc    Get testimonial by ID
 * @access  Public
 */
export const getTestimonialById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const testimonial = await prisma.testimonials.findUnique({
      where: { id },
    });

    if (!testimonial) {
      return res.status(404).json({ 
        status: 0,
        message: 'Testimonial not found' 
      });
    }

    // Format the response
    res.status(200).json({
      status: 1,
      message: 'Testimonial retrieved successfully',
      data: {
        ...testimonial,
        imageUrl: testimonial.imageLink ? `${process.env.APP_URL || ''}${testimonial.imageLink}` : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/testimonials
 * @desc    Create a new testimonial
 * @access  Private/Admin
 */
export const createTestimonial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, ratting } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Testimonial image is required' });
    }

    // Generate public URL for the uploaded image
    const imageUrl = generateTestimonialUrl(req.file.filename);

    const testimonial = await prisma.testimonials.create({
      data: {
        name,
        imageLink: imageUrl,
        description,
        ratting,
        status: 'ACTIVE',
      },
    });

    res.status(201).json({
      status: 1,
      message: 'Testimonial added successfully',
      data: {
        ...testimonial,
        // Return full URL
        imageUrl: `${process.env.APP_URL || ''}${imageUrl}`
      }
    });
  } catch (error) {
    // Clean up uploaded file if there was an error
    if (req.file) {
      deleteTestimonialImage(req.file.filename);
    }
    next(error);
  }
};

/**
 * @route   PUT /api/testimonials/:id
 * @desc    Update a testimonial
 * @access  Private/Admin
 */
export const updateTestimonial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, ratting, status } = req.body;

    // Check if testimonial exists
    const existingTestimonial = await prisma.testimonials.findUnique({
      where: { id },
    });

    if (!existingTestimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    const updateData: any = {
      name,
      description,
      ratting,
      status,
    };

    // If new image is uploaded, update the image link and delete the old one
    if (req.file) {
      // Delete old image
      if (existingTestimonial.imageLink) {
        deleteTestimonialImage(existingTestimonial.imageLink);
      }
      // Set new image URL
      updateData.imageLink = generateTestimonialUrl(req.file.filename);
    }

    const testimonial = await prisma.testimonials.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      ...testimonial,
      // Return full URL
      imageUrl: testimonial.imageLink ? `${process.env.APP_URL || ''}${testimonial.imageLink}` : null
    });
  } catch (error) {
    // Clean up uploaded file if there was an error
    if (req.file) {
      deleteTestimonialImage(req.file.filename);
    }
    next(error);
  }
};

/**
 * @route   DELETE /api/testimonials/:id
 * @desc    Delete a testimonial
 * @access  Private/Admin
 */
export const deleteTestimonial = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if testimonial exists
    const existingTestimonial = await prisma.testimonials.findUnique({
      where: { id },
    });

    if (!existingTestimonial) {
      return res.status(400).json({
        status: 0,
        message: 'Testimonial not found'
      });
    }

    // Delete the associated image file
    if (existingTestimonial.imageLink) {
      deleteTestimonialImage(existingTestimonial.imageLink);
    }

    await prisma.testimonials.delete({
      where: { id },
    });

    res.status(200).json({
      status: 1,
      message: 'Testimonial deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
