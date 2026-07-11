import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { uploadVideo, generatePublicUrl, deleteFile } from './upload.middleware';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fsExtra from 'fs-extra';
import { getVideoDurationFromUrl, formatDuration } from '../utils/video-utils';
import { uploadVideoToBunny, deleteVideoFromBunny } from '../services/bunnyStream';
import { uploadVideoToVdoCipher, deleteVideoFromVdoCipher } from '../services/vdoCipher';
import { convertToHLS } from '../services/hlsConverter';
import { uploadFolderToSpaces } from '../services/spacesUploader';
import { deleteFolderFromSpaces } from '../utils/deleteFolderFromSpaces';

const BUNNY_GUID_REGEX   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VDOCIPHER_ID_REGEX  = /^[0-9a-f]{32}$/i;

const vdoCipherEnabled = !!process.env.VDOCIPHER_API_SECRET;
const bunnyEnabled     = !!(process.env.BUNNY_API_KEY && process.env.BUNNY_LIBRARY_ID && process.env.BUNNY_TOKEN_KEY);
const r2Enabled        = !!(process.env.CF_R2_ACCESS_KEY && process.env.CF_R2_SECRET_KEY);

const unlinkAsync = promisify(fs.unlink);

export const getProductDetails = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        course: {
          include: {
            creator: true, 
            product:true
          },
        },
      }
    });

    if (!product) {
      res.status(200).json({ 
        status: 0,
        message: 'Product not found' 
      });
      return;
    }

    // Get video duration for the main product
    let duration = 0;
    let formattedDuration = '00:00:00';
    
    if (product.videoLink) {
      try {
        duration = await getVideoDurationFromUrl(product.videoLink);
        formattedDuration = formatDuration(duration);
      } catch (error) {
        console.error(`Error getting duration for product ${product.id}:`, error);
        duration = 0;
        formattedDuration = '00:00:00';
      }
    }

    // Get video durations for all products in the course
    const productsWithDuration = await Promise.all(
      product.course.product.map(async (p) => {
        let productDuration = 0;
        let productFormattedDuration = '00:00:00';
        
        if (p.videoLink) {
          try {
            productDuration = await getVideoDurationFromUrl(p.videoLink);
            productFormattedDuration = formatDuration(productDuration);
          } catch (error) {
            console.error(`Error getting duration for course product ${p.id}:`, error);
            productDuration = 0;
            productFormattedDuration = '00:00:00';
          }
        }
        
        return {
          ...p,
          duration: productDuration,
          formattedDuration: productFormattedDuration
        };
      })
    );

    // Map the product data to match the desired response format
    const responseData = {
      status: 1,
      message: 'Data found',
      product: {
        id: product.id,
        name: product.name,
        description: product.discription,  // Note: The field is 'discription' in the database
        videoLink: product.videoLink,
        duration, // Video duration in seconds
        formattedDuration, // Formatted duration (HH:MM:SS)
        status: product.status,
        course: {
          id: product.course.id,
          name: product.course.name,
          shortDescription: product.course.shortDescription,
          creator: product.course.creator,
          pdfLink: product.course.pdfLink,
          whatsAppLink: product.course.whatsAppLink,
          featured: product.course.featured,
          language: product.course.language,
          product: productsWithDuration.map(p => ({
            id: p.id,
            name: p.name,
            discription: p.discription,
            videoLink: p.videoLink,
            duration: p.duration, // Video duration in seconds
            formattedDuration: p.formattedDuration, // Formatted duration (HH:MM:SS)
            status: p.status,
            createdBy: p.createdBy,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          })),
        }
      }
    };

    res.status(200).json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/products/:productId/upload-video
 * @desc    Upload a video for a product
 * @access  Private/Admin
 */
export const uploadProductVideo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Handle file upload
    uploadVideo(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No video file provided' });

      try {
        let videoLink: string;

        if (vdoCipherEnabled) {
          // ── VdoCipher path (preferred) ─────────────────────────────
          if (product.videoLink && VDOCIPHER_ID_REGEX.test(product.videoLink)) {
            deleteVideoFromVdoCipher(product.videoLink).catch(console.error);
          }

          const buffer = req.file.buffer || fs.readFileSync(req.file.path);
          videoLink = await uploadVideoToVdoCipher(buffer, product.name || 'video');
          if (req.file.path) unlinkAsync(req.file.path).catch(() => {});

        } else if (bunnyEnabled) {
          // ── Bunny Stream fallback ──────────────────────────────────
          if (product.videoLink && BUNNY_GUID_REGEX.test(product.videoLink)) {
            deleteVideoFromBunny(product.videoLink).catch(console.error);
          }

          const buffer = req.file.buffer || fs.readFileSync(req.file.path);
          videoLink = await uploadVideoToBunny(buffer, product.name || 'video');
          if (req.file.path) unlinkAsync(req.file.path).catch(() => {});

        } else if (r2Enabled) {
          // ── R2 HLS (file already on disk via multer diskStorage) ──
          if (product.videoLink && !VDOCIPHER_ID_REGEX.test(product.videoLink) && !BUNNY_GUID_REGEX.test(product.videoLink)) {
            deleteFolderFromSpaces(product.videoLink.replace('/index.m3u8', '')).catch(console.error);
          }
          const sanitizedName   = (product.name || 'video').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
          const videoId         = `${sanitizedName}-${Date.now()}`;
          const tempRoot        = path.join(process.cwd(), 'temp');
          const rawPath         = req.file.path ?? path.join(tempRoot, `${videoId}.mp4`);
          const hlsFolder       = path.join(tempRoot, videoId);
          if (!req.file.path) {
            await fsExtra.ensureDir(tempRoot);
            await fsExtra.writeFile(rawPath, req.file.buffer);
          }
          await convertToHLS(rawPath, hlsFolder);
          const remoteFolder = `videos/products/${videoId}`;
          await uploadFolderToSpaces(hlsFolder, remoteFolder);
          await fsExtra.remove(rawPath);
          await fsExtra.remove(hlsFolder);
          videoLink = `${remoteFolder}/index.m3u8`;

        } else {
          // ── Local fallback (dev only) ──────────────────────────────
          if (product.videoLink) deleteFile(product.videoLink);
          videoLink = generatePublicUrl(req.file.filename);
        }

        const updatedProduct = await prisma.product.update({
          where: { id: productId },
          data: { videoLink },
        });

        res.status(200).json({
          message: 'Video uploaded successfully',
          videoUrl: videoLink,
          product: updatedProduct,
        });
      } catch (error) {
        if (req.file?.path) unlinkAsync(req.file.path).catch(() => {});
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/products/:productId/video
 * @desc    Delete a product's video
 * @access  Private/Admin
 */
export const deleteProductVideo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    if (!product.videoLink) {
      res.status(400).json({ error: 'No video found for this product' });
      return;
    }

    // Best-effort removal of the stored video — never block the DB reset on a
    // storage error, otherwise "delete video" fails even though the intent is
    // just to clear it from the lesson.
    try {
      if (VDOCIPHER_ID_REGEX.test(product.videoLink)) {
        deleteVideoFromVdoCipher(product.videoLink).catch(console.error);
      } else if (product.videoLink.includes('/index.m3u8')) {
        // HLS videos live as a folder on R2 (…/index.m3u8)
        await deleteFolderFromSpaces(product.videoLink.replace('/index.m3u8', ''));
      } else if (!BUNNY_GUID_REGEX.test(product.videoLink)) {
        deleteFile(product.videoLink);
      }
    } catch (storageErr) {
      console.error('Error removing stored video (continuing):', storageErr);
    }

    await prisma.product.update({
      where: { id: productId },
      data: { videoLink: '', videoStatus: 'idle' },
    });

    res.status(200).json({ message: 'Video deleted successfully' });
  } catch (error) {
    next(error);
  }
};