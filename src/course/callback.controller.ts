import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

// Public: create a callback request
export const createCallbackRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, phone, courseId, courseName, message } = req.body;

    if (!name || !phone) {
      res.status(400).json({ status: 0, message: 'Name and phone are required' });
      return;
    }

    const callback = await prisma.callbackRequest.create({
      data: {
        name: String(name),
        phone: String(phone),
        courseId: courseId ? String(courseId) : null,
        courseName: courseName ? String(courseName) : null,
        message: message ? String(message) : null,
      },
    });

    res.status(201).json({
      status: 1,
      message: 'Callback request submitted successfully',
      data: callback,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: list all callback requests
export const listCallbackRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Unauthorized' });
      return;
    }

    const requests = await prisma.callbackRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 1,
      message: 'Callback requests retrieved successfully',
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: update status (PENDING / CONTACTED / CLOSED)
export const updateCallbackRequest = async (
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
    const { status } = req.body;

    const updated = await prisma.callbackRequest.update({
      where: { id },
      data: { status: status ? String(status) : undefined },
    });

    res.status(200).json({ status: 1, message: 'Callback request updated', data: updated });
  } catch (error) {
    next(error);
  }
};

// Admin: delete a callback request
export const deleteCallbackRequest = async (
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
    await prisma.callbackRequest.delete({ where: { id } });
    res.status(200).json({ status: 1, message: 'Callback request deleted' });
  } catch (error) {
    next(error);
  }
};
