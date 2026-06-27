import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { notifyEventRegistration } from '../emails/notify';

export const listEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20, featured, category } = req.query;
    const where: any = { status: 'ACTIVE' };
    if (featured === 'true') where.featured = true;
    if (category) where.category = category as string;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.event.count({ where }),
    ]);

    res.json({ status: 1, data: { events, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
};

export const getEventById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { eventId } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { EventRegistration: true } } },
    });
    if (!event) { res.status(404).json({ status: 0, message: 'Event not found' }); return; }
    res.json({ status: 1, data: event });
  } catch (err) {
    next(err);
  }
};

export const registerForEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ status: 0, message: 'Unauthorized' }); return; }

    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) { res.status(404).json({ status: 0, message: 'Customer profile not found' }); return; }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) { res.status(404).json({ status: 0, message: 'Event not found' }); return; }

    const existing = await prisma.eventRegistration.findUnique({
      where: { eventId_customerId: { eventId, customerId: customer.id } },
    });
    if (existing) { res.status(400).json({ status: 0, message: 'Already registered for this event' }); return; }

    const registration = await prisma.eventRegistration.create({
      data: { eventId, customerId: customer.id, amount: event.price },
    });

    await notifyEventRegistration(customer.id, [event.title], event.price || '0');

    res.json({ status: 1, message: 'Registration successful', data: registration });
  } catch (err) {
    next(err);
  }
};

export const checkEventRegistered = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    if (!userId) { res.json({ status: 1, data: { registered: false } }); return; }

    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) { res.json({ status: 1, data: { registered: false } }); return; }

    const reg = await prisma.eventRegistration.findUnique({
      where: { eventId_customerId: { eventId, customerId: customer.id } },
    });
    res.json({ status: 1, data: { registered: !!reg } });
  } catch (err) {
    next(err);
  }
};

export const getMyRegistrations = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.json({ status: 1, data: [] }); return; }

    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) { res.json({ status: 1, data: [] }); return; }

    const registrations = await prisma.eventRegistration.findMany({
      where: { customerId: customer.id, status: 'ACTIVE' },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 1, data: registrations });
  } catch (err) {
    next(err);
  }
};
