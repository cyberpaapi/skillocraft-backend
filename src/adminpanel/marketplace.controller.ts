import { Request, Response, NextFunction } from 'express';
import { ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';

export const createMarketplaceProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Access denied.' });
    }
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const imageFiles = files?.images || [];

    const imageUrls: string[] = [];
    for (const f of imageFiles) {
      const url = await uploadToSpaces(f, 'images/marketplace');
      imageUrls.push(url);
    }

    let highlights: object[] = [];
    try { highlights = JSON.parse(req.body.highlights || '[]'); } catch {}

    const product = await prisma.marketplaceProduct.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        originalPrice: req.body.originalPrice || req.body.price,
        discount: req.body.discount || '0',
        category: req.body.category,
        images: imageUrls,
        highlights,
        specifications: req.body.specifications || null,
        importantNote: req.body.importantNote || null,
        deliveryInfo: req.body.deliveryInfo || null,
        status: ActiveStatus.ACTIVE,
        createdBy: req.user?.id || 'admin',
      },
    });
    res.status(201).json({ status: 1, message: 'Product created', data: product });
  } catch (error) {
    next(error);
  }
};

export const listMarketplaceProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (category) where.category = category;
    if (status) where.status = status;
    else where.status = ActiveStatus.ACTIVE;

    const [products, total] = await Promise.all([
      prisma.marketplaceProduct.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marketplaceProduct.count({ where }),
    ]);
    res.json({ status: 1, data: products, total, page, limit });
  } catch (error) {
    next(error);
  }
};

export const getMarketplaceProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.marketplaceProduct.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ status: 0, message: 'Not found' });
    res.json({ status: 1, data: product });
  } catch (error) {
    next(error);
  }
};

export const updateMarketplaceProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Access denied.' });
    }
    const existing = await prisma.marketplaceProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ status: 0, message: 'Not found' });

    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const imageFiles = files?.images || [];

    let imageUrls = existing.images;
    if (imageFiles.length > 0) {
      for (const old of existing.images) {
        try { await deleteFromSpaces(old); } catch {}
      }
      imageUrls = [];
      for (const f of imageFiles) {
        imageUrls.push(await uploadToSpaces(f, 'images/marketplace'));
      }
    }

    let highlights = existing.highlights;
    if (req.body.highlights) {
      try { highlights = JSON.parse(req.body.highlights); } catch {}
    }

    const updated = await prisma.marketplaceProduct.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name || existing.name,
        description: req.body.description || existing.description,
        price: req.body.price || existing.price,
        originalPrice: req.body.originalPrice || existing.originalPrice,
        discount: req.body.discount || existing.discount,
        category: req.body.category || existing.category,
        images: imageUrls,
        highlights,
        specifications: req.body.specifications ?? existing.specifications,
        importantNote: req.body.importantNote ?? existing.importantNote,
        deliveryInfo: req.body.deliveryInfo ?? existing.deliveryInfo,
        status: (req.body.status as ActiveStatus) || existing.status,
      },
    });
    res.json({ status: 1, message: 'Updated', data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteMarketplaceProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Access denied.' });
    }
    const product = await prisma.marketplaceProduct.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ status: 0, message: 'Not found' });

    for (const img of product.images) {
      try { await deleteFromSpaces(img); } catch {}
    }
    await prisma.marketplaceProduct.delete({ where: { id: req.params.id } });
    res.json({ status: 1, message: 'Deleted' });
  } catch (error) {
    next(error);
  }
};
