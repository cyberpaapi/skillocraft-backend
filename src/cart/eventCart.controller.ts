import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

const getCustomerId = async (req: AuthRequest): Promise<string | null> => {
  if (!req.user?.id) return null;
  const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
  return customer?.id || null;
};

// POST /event-cart  { eventId }
export const addToEventCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }

    const { eventId } = req.body;
    if (!eventId) { res.status(400).json({ status: 0, message: 'eventId is required' }); return; }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) { res.status(404).json({ status: 0, message: 'Event not found' }); return; }

    // Already registered?
    const registered = await prisma.eventRegistration.findUnique({
      where: { eventId_customerId: { eventId, customerId } },
    });
    if (registered) { res.status(400).json({ status: 0, message: 'You are already registered for this event' }); return; }

    const item = await prisma.eventCart.upsert({
      where: { customerId_eventId: { customerId, eventId } },
      update: {},
      create: { customerId, eventId },
    });

    res.status(200).json({ status: 1, message: 'Added to cart', data: item });
  } catch (error) {
    next(error);
  }
};

// GET /event-cart
export const listEventCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }

    const items = await prisma.eventCart.findMany({
      where: { customerId },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 1,
      data: items.map((i) => ({
        id: i.id,
        eventId: i.eventId,
        title: i.event.title,
        imageLink: i.event.imageLink,
        date: i.event.date,
        time: i.event.time,
        venue: i.event.venue,
        price: i.event.price,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /event-cart/:id
export const removeFromEventCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }
    const { id } = req.params;
    const item = await prisma.eventCart.findFirst({ where: { id, customerId } });
    if (!item) { res.status(404).json({ status: 0, message: 'Cart item not found' }); return; }
    await prisma.eventCart.delete({ where: { id } });
    res.status(200).json({ status: 1, message: 'Removed from cart' });
  } catch (error) {
    next(error);
  }
};
