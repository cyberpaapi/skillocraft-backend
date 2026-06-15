import { Request, Response } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';

export const getSiteSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = (req.query.keys as string)?.split(',').filter(Boolean);
    const where = keys?.length ? { key: { in: keys } } : {};
    const settings = await (prisma as any).siteSettings.findMany({ where });
    const result: Record<string, string | null> = {};
    for (const s of settings) result[s.key] = s.value;
    res.status(200).json({ status: 1, data: result });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to fetch settings' });
  }
};

export const setSiteSetting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key, value } = req.body;
    if (!key) {
      res.status(400).json({ status: 0, message: 'Key is required' });
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
