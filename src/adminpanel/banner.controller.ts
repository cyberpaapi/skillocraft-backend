import { Request, Response, NextFunction } from 'express';
import { BannerLocation, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadFile } from '../utils/uploadFile';

export const listBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { location, status = 'ACTIVE' } = req.query;
    const where: any = {};
    if (location) where.bannerLocation = location as string;
    if (status) where.status = status as string;

    const banners = await prisma.banner.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 1, data: banners });
  } catch (err) {
    next(err);
  }
};

export const createBanner = async (
  req: AuthRequest & { file?: Express.Multer.File },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }

    const { name, description, bannerLocation } = req.body;
    if (!name || !bannerLocation) {
      res.status(400).json({ status: 0, message: 'name and bannerLocation are required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ status: 0, message: 'Banner image is required' });
      return;
    }

    const imageLink = await uploadFile(req.file, 'skillocraft/banners', 'images/banners', 'image');

    const banner = await prisma.banner.create({
      data: {
        name,
        description,
        bannerLocation: bannerLocation as BannerLocation,
        imageLink,
        status: ActiveStatus.ACTIVE,
      },
    });
    res.status(201).json({ status: 1, message: 'Banner created', data: banner });
  } catch (err) {
    next(err);
  }
};

export const updateBanner = async (
  req: AuthRequest & { file?: Express.Multer.File },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }

    const { bannerId } = req.params;
    const updateData: any = {};

    if (req.body.name) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.bannerLocation) updateData.bannerLocation = req.body.bannerLocation;
    if (req.body.status) updateData.status = req.body.status;

    if (req.file) {
      updateData.imageLink = await uploadFile(req.file, 'skillocraft/banners', 'images/banners', 'image');
    }

    const banner = await prisma.banner.update({ where: { id: bannerId }, data: updateData });
    res.json({ status: 1, message: 'Banner updated', data: banner });
  } catch (err) {
    next(err);
  }
};

export const deleteBanner = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Admin access required' });
      return;
    }
    const { bannerId } = req.params;
    await prisma.banner.delete({ where: { id: bannerId } });
    res.json({ status: 1, message: 'Banner deleted' });
  } catch (err) {
    next(err);
  }
};
