import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

// POST /doubt-requests  (protected — enrolled student only)
export const createDoubtRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.email) {
      res.status(401).json({ status: 0, message: 'Authentication required' });
      return;
    }
    const { courseId, message } = req.body;
    if (!courseId) {
      res.status(400).json({ status: 0, message: 'courseId is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: req.user.email } });
    const customer = user ? await prisma.customer.findFirst({ where: { userId: user.id } }) : null;
    if (!user || !customer) {
      res.status(403).json({ status: 0, message: 'Customer not found' });
      return;
    }

    // Verify the student actually purchased this course
    const order = await prisma.orders.findFirst({
      where: {
        customerId: customer.id,
        course: { some: { id: courseId } },
        status: 'ACTIVE',
      },
    });
    if (!order) {
      res.status(403).json({ status: 0, message: 'You must purchase this course to request doubt clearing' });
      return;
    }

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });

    const doubt = await prisma.doubtRequest.create({
      data: {
        name: customer.name || user.email,
        phone: user.contact || '',
        customerId: customer.id,
        courseId,
        courseName: course?.name || null,
        message: message ? String(message) : null,
      },
    });

    res.status(201).json({ status: 1, message: 'Doubt clearing request submitted', data: doubt });
  } catch (error) {
    next(error);
  }
};

// GET /adminpanel/doubt-requests (admin)
export const listDoubtRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Unauthorized' });
      return;
    }
    const requests = await prisma.doubtRequest.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ status: 1, message: 'Doubt requests retrieved', data: requests });
  } catch (error) {
    next(error);
  }
};

// PATCH /adminpanel/doubt-requests/:id (admin)
export const updateDoubtRequest = async (
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
    const updated = await prisma.doubtRequest.update({
      where: { id },
      data: { status: status ? String(status) : undefined },
    });
    res.status(200).json({ status: 1, message: 'Doubt request updated', data: updated });
  } catch (error) {
    next(error);
  }
};

// DELETE /adminpanel/doubt-requests/:id (admin)
export const deleteDoubtRequest = async (
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
    await prisma.doubtRequest.delete({ where: { id } });
    res.status(200).json({ status: 1, message: 'Doubt request deleted' });
  } catch (error) {
    next(error);
  }
};
