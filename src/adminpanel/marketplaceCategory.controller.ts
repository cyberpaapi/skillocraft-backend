import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

/**
 * Ensures a marketplace category with the given name exists (case-insensitive).
 * Returns the canonical category. Safe to call repeatedly.
 */
export const ensureMarketplaceCategory = async (name: string, imageUrl?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const existing = await prisma.marketplaceCategory.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });
  if (existing) {
    // backfill an image if we have one and it's missing
    if (imageUrl && !existing.imageUrl) {
      return prisma.marketplaceCategory.update({ where: { id: existing.id }, data: { imageUrl } });
    }
    return existing;
  }
  return prisma.marketplaceCategory.create({ data: { name: trimmed, imageUrl: imageUrl || null } });
};

/**
 * Replicates every course category (and any existing product category) into the
 * marketplace category list, so they "reflect" automatically without a migration.
 */
export const syncMarketplaceCategories = async () => {
  const [courseCats, productCats, mpCats] = await Promise.all([
    prisma.category.findMany({ select: { name: true, imageUrl: true } }),
    prisma.marketplaceProduct.findMany({ select: { category: true }, distinct: ['category'] }),
    prisma.marketplaceCategory.findMany({ select: { name: true } }),
  ]);

  const have = new Set(mpCats.map((c) => c.name.trim().toLowerCase()));
  const toAdd = new Map<string, string>(); // lowercased -> display name

  for (const c of courseCats) {
    const key = c.name.trim().toLowerCase();
    if (key && !have.has(key) && !toAdd.has(key)) toAdd.set(key, c.name.trim());
  }
  for (const p of productCats) {
    const key = (p.category || '').trim().toLowerCase();
    if (key && !have.has(key) && !toAdd.has(key)) toAdd.set(key, p.category.trim());
  }

  // create missing ones (sequentially to respect the unique constraint)
  for (const [, displayName] of toAdd) {
    try {
      await prisma.marketplaceCategory.create({ data: { name: displayName } });
    } catch {
      // ignore race / unique conflicts
    }
  }
};

// GET /marketplace-categories (public) and /adminpanel/marketplace-categories (admin)
export const listMarketplaceCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await syncMarketplaceCategories();
    const categories = await prisma.marketplaceCategory.findMany({ orderBy: { name: 'asc' } });
    res.json({ status: 1, data: categories });
  } catch (error) {
    next(error);
  }
};

// POST /adminpanel/marketplace-categories  { name }
export const createMarketplaceCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Access denied.' });
    }
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ status: 0, message: 'Category name is required' });

    const existing = await prisma.marketplaceCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      return res.json({ status: 1, message: 'Category already exists', data: existing });
    }
    const created = await prisma.marketplaceCategory.create({ data: { name } });
    res.status(201).json({ status: 1, message: 'Category created', data: created });
  } catch (error) {
    next(error);
  }
};

// DELETE /adminpanel/marketplace-categories/:id
export const deleteMarketplaceCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Access denied.' });
    }
    await prisma.marketplaceCategory.delete({ where: { id: req.params.id } });
    res.json({ status: 1, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
};
