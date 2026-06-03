import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadFile } from '../utils/uploadFile';

export const createEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }

    const { title, shortDescription, description, date, time, venue, price, category, featured } = req.body;
    const missing = ['title', 'shortDescription', 'description', 'date', 'time', 'venue', 'price'].filter(f => !req.body[f]);
    if (missing.length > 0) {
      res.status(400).json({ status: 0, message: `Missing fields: ${missing.join(', ')}` });
      return;
    }

    let imageLink: string | undefined;
    if (req.file) {
      imageLink = await uploadFile(req.file, 'skillocraft/images/events', 'images/events', 'image');
    }

    const event = await prisma.event.create({
      data: {
        title,
        shortDescription,
        description,
        date,
        time,
        venue,
        price,
        category: category || 'General',
        featured: featured === 'true' || featured === true,
        imageLink,
        createdBy: req.user.id,
        status: 'ACTIVE',
      },
    });

    res.status(201).json({ status: 1, message: 'Event created', data: event });
  } catch (err) {
    next(err);
  }
};

export const updateEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }

    const { eventId } = req.params;
    const { title, shortDescription, description, date, time, venue, price, category, featured, status } = req.body;

    const updateData: any = {};
    if (title) updateData.title = title;
    if (shortDescription) updateData.shortDescription = shortDescription;
    if (description) updateData.description = description;
    if (date) updateData.date = date;
    if (time) updateData.time = time;
    if (venue) updateData.venue = venue;
    if (price) updateData.price = price;
    if (category) updateData.category = category;
    if (featured !== undefined) updateData.featured = featured === 'true' || featured === true;
    if (status) updateData.status = status;

    if (req.file) {
      updateData.imageLink = await uploadFile(req.file, 'skillocraft/images/events', 'images/events', 'image');
    }

    const event = await prisma.event.update({ where: { id: eventId }, data: updateData });
    res.json({ status: 1, message: 'Event updated', data: event });
  } catch (err) {
    next(err);
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }
    const { eventId } = req.params;
    await prisma.event.delete({ where: { id: eventId } });
    res.json({ status: 1, message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
};

export const listEventsAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { EventRegistration: true } } },
      }),
      prisma.event.count(),
    ]);
    res.json({ status: 1, data: { events, total } });
  } catch (err) {
    next(err);
  }
};
