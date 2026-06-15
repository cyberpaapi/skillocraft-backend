import { Request, Response } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadToSpaces } from '../utils/uploadToSpaces';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';

export const createCourseDownload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ status: 0, message: 'File is required' });
      return;
    }
    const fileUrl = await uploadToSpaces(file, 'downloads/courses');
    const download = await prisma.courseDownload.create({
      data: {
        courseId,
        fileName: (req.body.fileName || file.originalname).trim(),
        fileUrl,
        fileSize: String(Math.round(file.size / 1024)) + ' KB',
      },
    });
    res.status(201).json({ status: 1, message: 'Download added', data: download });
  } catch (error) {
    console.error('Error adding course download:', error);
    res.status(500).json({ status: 0, message: 'Failed to add download' });
  }
};

export const listCourseDownloads = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const downloads = await prisma.courseDownload.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ status: 1, data: downloads });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to fetch downloads' });
  }
};

export const deleteCourseDownload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { downloadId } = req.params;
    const download = await prisma.courseDownload.findUnique({ where: { id: downloadId } });
    if (!download) {
      res.status(404).json({ status: 0, message: 'Download not found' });
      return;
    }
    await deleteFromSpaces(download.fileUrl);
    await prisma.courseDownload.delete({ where: { id: downloadId } });
    res.status(200).json({ status: 1, message: 'Download deleted' });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Failed to delete download' });
  }
};
