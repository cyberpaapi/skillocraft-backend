import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export const createGeneralFAQ = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { question, answer } = req.body;

    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Validate required fields
    if (!question || !answer) {
      res.status(400).json({
        status: 0,
        message: 'Question and answer are required',
        error: 'Missing required fields'
      });
      return;
    }

    const newFaq = await prisma.generalFAQ.create({
      data: {
        question,
        answer,
        location: req.body.location || 'homepage',
        status: 'ACTIVE'
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

export const listGeneralFAQs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { location } = req.query as { location?: string };
    const faqs = await prisma.generalFAQ.findMany({
      where: {
        status: 'ACTIVE',
        ...(location ? { location } : {})
      },
      orderBy: {
        createdAt: 'desc'
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

export const getGeneralFAQById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const faq = await prisma.generalFAQ.findUnique({
      where: { 
        id,
        status: 'ACTIVE'
      }
    });

    if (!faq) {
      res.status(404).json({
        status: 0,
        message: 'FAQ not found',
        error: 'The requested FAQ does not exist or is inactive'
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

export const updateGeneralFAQ = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { question, answer, status } = req.body;

    // Check if FAQ exists
    const existingFaq = await prisma.generalFAQ.findUnique({
      where: { id }
    });

    if (!existingFaq) {
      res.status(404).json({
        status: 0,
        message: 'FAQ not found',
        error: 'The specified FAQ does not exist'
      });
      return;
    }

    const updatedFaq = await prisma.generalFAQ.update({
      where: { id },
      data: {
        question: question !== undefined ? question : existingFaq.question,
        answer: answer !== undefined ? answer : existingFaq.answer,
        location: req.body.location !== undefined ? req.body.location : (existingFaq as any).location,
        status: status !== undefined ? status : existingFaq.status
      }
    });

    res.status(200).json({
      status: 1,
      message: 'FAQ updated successfully',
      data: updatedFaq
    });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update FAQ',
      error: 'Internal server error'
    });
  }
};

export const deleteGeneralFAQ = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if FAQ exists
    const existingFaq = await prisma.generalFAQ.findUnique({
      where: { id }
    });

    if (!existingFaq) {
      res.status(404).json({
        status: 0,
        message: 'FAQ not found',
        error: 'The specified FAQ does not exist'
      });
      return;
    }

    // Soft delete by setting status to INACTIVE
    await prisma.generalFAQ.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });

    res.status(200).json({
      status: 1,
      message: 'FAQ deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to delete FAQ',
      error: 'Internal server error'
    });
  }
};