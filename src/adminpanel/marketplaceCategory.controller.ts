import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

const SUPPRESS_KEY = 'marketplace_suppressed_categories';

// Names (lowercased) the admin has explicitly deleted — the auto-sync must not re-add them.
const getSuppressed = async (): Promise<Set<string>> => {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: SUPPRESS_KEY } });
    const arr = s?.value ? JSON.parse(s.value) : [];
    return new Set(Array.isArray(arr) ? arr.map((x: string) => String(x).toLowerCase()) : []);
  } catch {
    return new Set();
  }
};

const saveSuppressed = async (set: Set<string>) => {
  await prisma.siteSettings.upsert({
    where: { key: SUPPRESS_KEY },
    update: { value: JSON.stringify([...set]) },
    create: { key: SUPPRESS_KEY, value: JSON.stringify([...set]) },
  });
};

const unsuppress = async (name: string) => {
  const set = await getSuppressed();
  if (set.delete(name.trim().toLowerCase())) await saveSuppressed(set);
};

/**
 * Ensures a marketplace category with the given name exists (case-insensitive).
 * This is an explicit action (a product or course is using the category), so it
 * also clears any prior suppression for that name.
 */
export const ensureMarketplaceCategory = async (name: string, imageUrl?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  await unsuppress(trimmed);
  const existing = await prisma.marketplaceCategory.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });
  if (existing) {
    if (imageUrl && !existing.imageUrl) {
      return prisma.marketplaceCategory.update({ where: { id: existing.id }, data: { imageUrl } });
    }
    return existing;
  }
  return prisma.marketplaceCategory.create({ data: { name: trimmed, imageUrl: imageUrl || null } });
};

/**
 * Replicates every course category (and any existing product category) into the
 * marketplace category list — except names the admin has explicitly deleted.
 */
export const syncMarketplaceCategories = async () => {
  const [courseCats, productCats, mpCats, suppressed] = await Promise.all([
    prisma.category.findMany({ select: { name: true, imageUrl: true } }),
    prisma.marketplaceProduct.findMany({ select: { category: true }, distinct: ['category'] }),
    prisma.marketplaceCategory.findMany({ select: { name: true } }),
    getSuppressed(),
  ]);

  const have = new Set(mpCats.map((c) => c.name.trim().toLowerCase()));
  const toAdd = new Map<string, string>(); // lowercased -> display name

  const consider = (raw?: string) => {
    const key = (raw || '').trim().toLowerCase();
    const display = (raw || '').trim();
    if (key && !have.has(key) && !suppressed.has(key) && !toAdd.has(key)) toAdd.set(key, display);
  };

  for (const c of courseCats) consider(c.name);
  for (const p of productCats) consider(p.category);

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

    await unsuppress(name);

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
    const cat = await prisma.marketplaceCategory.findUnique({ where: { id: req.params.id } });
    if (cat) {
      // Remember the deletion so the course-category sync won't re-add it
      const set = await getSuppressed();
      set.add(cat.name.trim().toLowerCase());
      await saveSuppressed(set);
      await prisma.marketplaceCategory.delete({ where: { id: req.params.id } });
    }
    res.json({ status: 1, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
};
