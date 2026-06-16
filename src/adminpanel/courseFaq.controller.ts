import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export const createCourseFAQ = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { question, answer, courseId } = req.body;
    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Validate required fields
    if (!question || !answer || !courseId) {
      res.status(400).json({
        status: 0,
        message: 'Question, answer, and courseId are required',
        error: 'Missing required fields'
      });
      return;
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      res.status(404).json({
        status: 0,
        message: 'Course not found',
        error: 'The specified course does not exist'
      });
      return;
    }

    const newFaq = await prisma.courseFAQ.create({
      data: {
        question,
        answer,
        course: {
          connect: { id: courseId }
        },
        status: 'ACTIVE'
      },
      include: {
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(201).json({
      status: 1,
      message: 'FAQ created successfully',
      data: newFaq
    });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to create FAQ',
      error: errorMessage
    });
  }
};

export const listCourseFAQs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.query;
    
    const where: Prisma.CourseFAQWhereInput = {
      status: 'ACTIVE'
    };

    if (courseId && typeof courseId === 'string') {
      where.courseId = courseId;
    }

    const faqs = await prisma.courseFAQ.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(200).json({
      status: 1,
      message: 'FAQs retrieved successfully',
      data: faqs
    });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch FAQs',
      error: 'Internal server error'
    });
  }
};

export const getCourseFAQById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const faq = await prisma.courseFAQ.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!faq) {
      res.status(404).json({
        status: 0,
        message: 'FAQ not found',
        error: 'The requested FAQ does not exist'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      message: 'FAQ retrieved successfully',
      data: faq
    });
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch FAQ',
      error: 'Internal server error'
    });
  }
};

export const deleteCourseFAQ = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    await prisma.courseFAQ.delete({ where: { id } });
    res.json({ status: 1, message: 'FAQ deleted' });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to delete FAQ' });
  }
};

export const getCourseFAQByCourseId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const courseId = req.params.courseId || req.params.id;

    const faq = await prisma.courseFAQ.findMany({
      where: { courseId },
      include: {
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!faq) {
      res.status(404).json({
        status: 0,
        message: 'FAQ not found',
        error: 'The requested FAQ does not exist'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      message: 'FAQ retrieved successfully',
      data: faq
    });
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch FAQ',
      error: 'Internal server error'
    });
  }
};