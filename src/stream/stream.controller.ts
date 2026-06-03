import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../db/db.config';

export const streamVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;

    // Get product from database
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { videoLink: true }
    });

    if (!product || !product.videoLink) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    // Extract filename from the videoLink
    const filename = path.basename(product.videoLink);
    const videoPath = path.join(process.cwd(), 'uploads', 'videos', 'products', filename);

    // Check if file exists
    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse Range header (e.g., "bytes=32324-")
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Error streaming video' });
  }
};

export const getVideoInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { 
        id: true,
        name: true,
        videoLink: true,
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!product || !product.videoLink) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const filename = path.basename(product.videoLink);
    const videoPath = path.join(process.cwd(), 'uploads', 'videos', 'products', filename);

    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const stat = fs.statSync(videoPath);
    
    res.status(200).json({
      status: 1,
      data: {
        id: product.id,
        name: product.name,
        videoUrl: `/api/stream/video/${productId}`,
        duration: 0, // You can use a library like 'fluent-ffmpeg' to get duration
        size: stat.size,
        mimeType: 'video/mp4',
        course: product.course
      }
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: 'Error getting video info' });
  }
};
