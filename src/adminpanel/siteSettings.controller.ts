import { Request, Response } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';

/**
 * Settings that must never reach a browser. GET /site-settings is public and
 * returns everything when no keys are given, so anything secret has to be
 * filtered there rather than relying on callers to ask nicely.
 */
const SECRET_KEYS = new Set(['openai_api_key']);

export const isSecretKey = (key: string): boolean =>
  SECRET_KEYS.has(key) || /(_secret|_api_key|_private_key|password|_token)$/i.test(key);

/** Show enough to recognise a key, never enough to use it. */
const maskSecret = (value: string | null): string | null => {
  if (!value) return null;
  const tail = value.slice(-4);
  return value.length <= 8 ? '****' : `${'*'.repeat(8)}${tail}`;
};

const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ status: 0, message: 'Admin access required' });
    return false;
  }
  return true;
};


export const getSiteSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = (req.query.keys as string)?.split(',').filter(Boolean);
    const where = keys?.length ? { key: { in: keys } } : {};
    const settings = await (prisma as any).siteSettings.findMany({ where });
    const result: Record<string, string | null> = {};
    // Secrets are never exposed here, even when asked for by name.
    for (const s of settings) {
      if (isSecretKey(s.key)) continue;
      result[s.key] = s.value;
    }
    res.status(200).json({ status: 1, data: result });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to fetch settings' });
  }
};

export const setSiteSetting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    const { key, value } = req.body;
    if (!key) {
      res.status(400).json({ status: 0, message: 'Key is required' });
      return;
    }
    // The admin UI shows masked secrets; echoing one back must not overwrite
    // the real value with asterisks.
    if (isSecretKey(key) && typeof value === 'string' && /^\*{8}/.test(value)) {
      res.status(400).json({ status: 0, message: 'Enter a new value or leave the field untouched' });
      return;
    }
    const setting = await (prisma as any).siteSettings.upsert({
      where: { key },
      update: { value: value ?? null },
      create: { key, value: value ?? null },
    });
    res.status(200).json({ status: 1, data: setting });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to save setting' });
  }
};

export const uploadSiteVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    const { key } = req.body;
    const file = req.file;
    if (!key || !file) {
      res.status(400).json({ status: 0, message: 'Key and video file are required' });
      return;
    }
    const fileUrl = await uploadToSpaces(file, 'videos/settings');
    const setting = await (prisma as any).siteSettings.upsert({
      where: { key },
      update: { value: fileUrl },
      create: { key, value: fileUrl },
    });
    res.status(200).json({ status: 1, data: setting });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to upload video' });
  }
};

export const uploadSiteImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    const { key, append } = req.body;
    const file = req.file;
    if (!key || !file) {
      res.status(400).json({ status: 0, message: 'Key and image file are required' });
      return;
    }
    const fileUrl = await uploadToSpaces(file, 'images/settings');
    let newValue = fileUrl;
    if (append === 'true') {
      const existing = await (prisma as any).siteSettings.findUnique({ where: { key } });
      let arr: string[] = [];
      try { arr = existing?.value ? JSON.parse(existing.value) : []; } catch { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr.push(fileUrl);
      newValue = JSON.stringify(arr);
    }
    const setting = await (prisma as any).siteSettings.upsert({
      where: { key },
      update: { value: newValue },
      create: { key, value: newValue },
    });
    res.status(200).json({ status: 1, data: setting, url: fileUrl });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to upload image' });
  }
};

export const removeSiteImageItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    const { key, url } = req.body;
    if (!key || !url) {
      res.status(400).json({ status: 0, message: 'Key and url are required' });
      return;
    }
    const existing = await (prisma as any).siteSettings.findUnique({ where: { key } });
    let arr: string[] = [];
    try { arr = existing?.value ? JSON.parse(existing.value) : []; } catch { arr = []; }
    arr = arr.filter((u: string) => u !== url);
    const setting = await (prisma as any).siteSettings.upsert({
      where: { key },
      update: { value: JSON.stringify(arr) },
      create: { key, value: JSON.stringify(arr) },
    });
    res.status(200).json({ status: 1, data: setting });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to remove image' });
  }
};

/**
 * Admin view of every setting. Secrets come back masked with a flag saying
 * whether a value is stored, so the panel can show "configured" without ever
 * shipping the real key to a browser.
 */
export const getAdminSiteSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    const settings = await (prisma as any).siteSettings.findMany({ orderBy: { key: 'asc' } });
    const data = settings.map((s: any) => {
      const secret = isSecretKey(s.key);
      return {
        key: s.key,
        value: secret ? maskSecret(s.value) : s.value,
        isSecret: secret,
        isSet: !!(s.value && String(s.value).trim()),
        updatedAt: s.updatedAt,
      };
    });
    res.status(200).json({ status: 1, data });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to fetch settings' });
  }
};
