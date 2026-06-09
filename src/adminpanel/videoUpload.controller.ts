import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import jwt from 'jsonwebtoken';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { getPresignedPutUrl, getPresignedGetUrl, downloadFromR2, deleteFromR2, readTextFromR2 } from '../services/r2Presign';
import { convertToHLS } from '../services/hlsConverter';
import { uploadFolderToSpaces } from '../services/spacesUploader';

// ── Generate a presigned PUT URL for direct browser-to-R2 upload ─────────────

export const getUploadUrl = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, fileName, contentType = 'video/mp4' } = req.body;
    if (!productId || !fileName) {
      return res.status(400).json({ status: 0, message: 'productId and fileName required' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Product not found' });

    const ext    = path.extname(fileName).toLowerCase() || '.mp4';
    const r2Key  = `videos/raw/${productId}${ext}`;
    const putUrl = await getPresignedPutUrl(r2Key, contentType);

    await prisma.product.update({
      where: { id: productId },
      data: { videoStatus: 'uploading', videoLink: r2Key },
    });

    res.json({ status: 1, putUrl, r2Key });
  } catch (err) {
    next(err);
  }
};

// ── Called by frontend after XHR upload completes ────────────────────────────

export const confirmUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Product not found' });

    await prisma.product.update({
      where: { id: productId },
      data: { videoStatus: 'ready' },
    });

    res.json({ status: 1, message: 'Video upload confirmed', videoStatus: 'ready' });
  } catch (err) {
    next(err);
  }
};

// ── Trigger background HLS conversion ────────────────────────────────────────

export const startHlsConversion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Product not found' });
    if (!product.videoLink) return res.status(400).json({ status: 0, message: 'No video uploaded yet' });
    if (product.videoStatus === 'converting') {
      return res.status(400).json({ status: 0, message: 'Already converting' });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { videoStatus: 'converting' },
    });

    // Respond immediately — processing happens in background
    res.json({ status: 1, message: 'HLS conversion started' });

    // Fire and forget
    runHlsConversion(productId, product.videoLink).catch(async (err) => {
      console.error(`HLS conversion failed for ${productId}:`, err);
      await prisma.product.update({
        where: { id: productId },
        data: { videoStatus: 'failed' },
      }).catch(() => {});
    });
  } catch (err) {
    next(err);
  }
};

// ── Background HLS conversion job ─────────────────────────────────────────────

async function runHlsConversion(productId: string, rawKey: string): Promise<void> {
  const tempRoot   = path.join(process.cwd(), 'temp', 'hls');
  const rawPath    = path.join(tempRoot, `${productId}.mp4`);
  const hlsFolder  = path.join(tempRoot, productId);

  await fs.ensureDir(tempRoot);

  try {
    console.log(`[HLS] Downloading ${rawKey} for product ${productId}`);
    await downloadFromR2(rawKey, rawPath);

    console.log(`[HLS] Converting ${productId} to HLS`);
    await convertToHLS(rawPath, hlsFolder);

    const remoteHlsFolder = `videos/hls/${productId}`;
    console.log(`[HLS] Uploading HLS segments for ${productId}`);
    await uploadFolderToSpaces(hlsFolder, remoteHlsFolder);

    const hlsKey = `${remoteHlsFolder}/index.m3u8`;
    await prisma.product.update({
      where: { id: productId },
      data: { videoLink: hlsKey, videoStatus: 'hls_ready' },
    });

    console.log(`[HLS] Done for product ${productId}`);
  } finally {
    await fs.remove(rawPath).catch(() => {});
    await fs.remove(hlsFolder).catch(() => {});
  }
}

// ── Serve HLS manifest with presigned segment URLs (authenticated) ────────────
// Route: GET /stream/hls/:productId?token=xxx

export const serveHlsManifest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { token } = req.query as { token?: string };

    // Validate short-lived HLS token
    if (!token) return res.status(401).json({ message: 'Missing token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { productId: string };
      if (payload.productId !== productId) throw new Error('Token mismatch');
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product?.videoLink) return res.status(404).json({ message: 'Not found' });

    // Read the m3u8 from R2
    const manifest = await readTextFromR2(product.videoLink);
    const hlsFolder = product.videoLink.replace('/index.m3u8', '');

    // Replace each segment filename with a presigned GET URL (30 min expiry)
    const lines = manifest.split('\n');
    const rewritten = await Promise.all(
      lines.map(async (line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        // It's a segment filename like segment000.ts
        const segmentKey = `${hlsFolder}/${trimmed}`;
        const presignedUrl = await getPresignedGetUrl(segmentKey, 30 * 60);
        return presignedUrl;
      })
    );

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(rewritten.join('\n'));
  } catch (err) {
    next(err);
  }
};
