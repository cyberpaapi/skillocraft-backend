import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { z } from 'zod';

// Schema for validating review creation request body
const createReviewSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  courseId: z.string().uuid('Invalid course ID format'),
  details: z.string().min(1, 'Review details are required').max(1000, 'Review details must be less than 1000 characters'),
  ratting: z.number().int('Rating must be an integer').min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
});

// Create review (Admin Only)
export const createReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        status: 0,
        message: 'Access denied. Admin privileges required.',
      });
    }

    // Validate request body
    const validationResult = createReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid request body',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }

    const { customerId, courseId, details, ratting } = validationResult.data;

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        status: 0,
        message: 'Customer not found',
      });
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found',
      });
    }

    // Check if customer has purchased the course
    const order = await prisma.orders.findFirst({
      where: {
        customerId: customerId,
        course: {
          some: {
            id: courseId,
          },
        },
        status: 'ACTIVE',
      },
    });

    if (!order) {
      return res.status(403).json({
        status: 0,
        message: 'Customer has not purchased this course',
      });
    }

    // Check if customer has already reviewed this course
    const existingReview = await prisma.review.findFirst({
      where: {
        customerId: customerId,
        courseId: courseId,
        status: 'ACTIVE',
      },
    });

    if (existingReview) {
      return res.status(409).json({
        status: 0,
        message: 'Customer has already reviewed this course',
      });
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        customerId,
        courseId,
        details,
        ratting,
      },
    });

    res.status(201).json({
      status: 1,
      message: 'Review created successfully',
      data: {
        id: review.id,
        customerId: review.customerId,
        courseId: review.courseId,
        details: review.details,
        ratting: review.ratting,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};