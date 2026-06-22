import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

// POST /certificate-requests  (protected — enrolled student only)
export const createCertificateRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.email) {
      res.status(401).json({ status: 0, message: 'Authentication required' });
      return;
    }
    const { courseId } = req.body;
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
      res.status(403).json({ status: 0, message: 'You must purchase this course to request a certificate' });
      return;
    }

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });

    const request = await prisma.certificateRequest.create({
      data: {
        name: customer.name || user.email,
        email: user.email,
        phone: user.contact || null,
        customerId: customer.id,
        courseId,
        courseName: course?.name || null,
      },
    });

    res.status(201).json({ status: 1, message: 'Certificate request submitted', data: request });
  } catch (error) {
    next(error);
  }
};

// GET /adminpanel/certificate-requests (admin)
export const listCertificateRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Unauthorized' });
      return;
    }
    const requests = await prisma.certificateRequest.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ status: 1, message: 'Certificate requests retrieved', data: requests });
  } catch (error) {
    next(error);
  }
};

// PATCH /adminpanel/certificate-requests/:id (admin)
export const updateCertificateRequest = async (
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
    const updated = await prisma.certificateRequest.update({
      where: { id },
      data: { status: status ? String(status) : undefined },
    });
    res.status(200).json({ status: 1, message: 'Certificate request updated', data: updated });
  } catch (error) {
    next(error);
  }
};

// DELETE /adminpanel/certificate-requests/:id (admin)
export const deleteCertificateRequest = async (
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
    await prisma.certificateRequest.delete({ where: { id } });
    res.status(200).json({ status: 1, message: 'Certificate request deleted' });
  } catch (error) {
    next(error);
  }
};
