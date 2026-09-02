import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { spacesClient } from '../config/spaces';
import { readTextFromR2 } from '../services/r2Presign';
import { generateEnglishCaptions } from '../services/captionGenerator';

// A lesson whose job died mid-flight (server restart, crash) would otherwise stay
// locked forever. After this long, another run may reclaim it.
const STALE_LOCK_MS = 30 * 60 * 1000;

// How many lessons transcribe at once during a whole-course run. ffmpeg is CPU
// heavy and OpenAI rate-limits per key, so this stays deliberately low.
const BATCH_CONCURRENCY = 2;

const captionKeyFor = (productId: string) => `captions/${productId}/en.vtt`;

/** Captions can only be produced for videos we host ourselves. */
const isCaptionable = (videoLink: string | null): boolean =>
  !!videoLink && (videoLink.startsWith('videos/raw/') || videoLink.startsWith('videos/hls/'));

const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ status: 0, message: 'Only an admin can generate captions' });
    return false;
  }
  return true;
};

// ── Atomic claim ─────────────────────────────────────────────────────────────

/**
 * Try to take ownership of a lesson for transcription.
 *
 * This is a single conditional UPDATE, so if two admins click at the same moment
 * exactly one wins and only one OpenAI job ever runs. A lesson that is already
 * `ready` is never re-transcribed unless `force` is set — that is what keeps the
 * whole-course button from re-billing work that is already done.
 */
async function claimLesson(productId: string, force: boolean): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);

  const claimable: any[] = [
    { captionStatus: { in: ['none', 'failed'] } },
    { captionStatus: 'processing', captionUpdatedAt: { lt: staleBefore } },
  ];
  if (force) claimable.push({ captionStatus: 'ready' });

  const claim = await prisma.product.updateMany({
    where: { id: productId, OR: claimable },
    data: { captionStatus: 'processing', captionError: null, captionUpdatedAt: new Date() },
  });

  return claim.count === 1;
}

// ── The job itself ───────────────────────────────────────────────────────────

async function runCaptionJob(productId: string, videoLink: string): Promise<void> {
  try {
    const vtt = await generateEnglishCaptions(productId, videoLink);
    const key = captionKeyFor(productId);

    await spacesClient.send(
      new PutObjectCommand({
        Bucket: process.env.CF_R2_BUCKET!,
        Key: key,
        Body: vtt,
        ContentType: 'text/vtt; charset=utf-8',
      })
    );

    await prisma.product.update({
      where: { id: productId },
      data: {
        captionStatus: 'ready',
        captionLink: key,
        captionError: null,
        captionUpdatedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Caption generation failed';
    console.error(`[CC] ${productId} failed:`, message);
    await prisma.product
      .update({
        where: { id: productId },
        data: {
          captionStatus: 'failed',
          captionError: message.slice(0, 500),
          captionUpdatedAt: new Date(),
        },
      })
      .catch(() => {});
  }
}

// ── Single lesson ────────────────────────────────────────────────────────────

export const generateProductCaptions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { productId } = req.params;
    const force = req.body?.force === true;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Lesson not found' });

    if (!isCaptionable(product.videoLink)) {
      return res.status(400).json({
        status: 0,
        message: product.videoLink
          ? 'Captions are only supported for videos hosted on our own storage'
          : 'This lesson has no video',
      });
    }

    if (product.captionStatus === 'ready' && !force) {
      return res.json({ status: 1, message: 'Captions already exist', captionStatus: 'ready' });
    }

    const claimed = await claimLesson(productId, force);
    if (!claimed) {
      return res.status(409).json({ status: 0, message: 'Caption generation is already running' });
    }

    res.json({ status: 1, message: 'Caption generation started', captionStatus: 'processing' });

    // Fire and forget — the job records its own outcome on the row.
    runCaptionJob(productId, product.videoLink!).catch(() => {});
  } catch (err) {
    next(err);
  }
};

// ── Whole course ─────────────────────────────────────────────────────────────

export const generateCourseCaptions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { courseId } = req.params;
    const force = req.body?.force === true;

    const lessons = await prisma.product.findMany({
      where: { courseId, status: 'ACTIVE' },
      select: { id: true, videoLink: true, captionStatus: true },
      orderBy: { order: 'asc' },
    });

    if (lessons.length === 0) {
      return res.status(404).json({ status: 0, message: 'No lessons found for this course' });
    }

    const eligible = lessons.filter((l) => isCaptionable(l.videoLink));
    const unsupported = lessons.length - eligible.length;
    const alreadyDone = eligible.filter((l) => l.captionStatus === 'ready').length;

    // Claim up front so the response can report a truthful queued count and so a
    // second click cannot double-queue the same lessons.
    const queued: { id: string; videoLink: string }[] = [];
    for (const lesson of eligible) {
      if (lesson.captionStatus === 'ready' && !force) continue;
      if (await claimLesson(lesson.id, force)) {
        queued.push({ id: lesson.id, videoLink: lesson.videoLink! });
      }
    }

    res.json({
      status: 1,
      message: queued.length ? 'Caption generation started' : 'Nothing to generate',
      queued: queued.length,
      skippedAlreadyDone: force ? 0 : alreadyDone,
      skippedUnsupported: unsupported,
      total: lessons.length,
    });

    // Drain the queue in the background with bounded concurrency.
    void (async () => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < queued.length) {
          const job = queued[cursor++];
          await runCaptionJob(job.id, job.videoLink);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(BATCH_CONCURRENCY, queued.length) }, worker)
      );
      console.log(`[CC] course ${courseId}: finished ${queued.length} lesson(s)`);
    })();
  } catch (err) {
    next(err);
  }
};

// ── Progress ─────────────────────────────────────────────────────────────────

export const getCourseCaptionStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { courseId } = req.params;
    const lessons = await prisma.product.findMany({
      where: { courseId, status: 'ACTIVE' },
      select: { id: true, name: true, videoLink: true, captionStatus: true, captionError: true },
      orderBy: { order: 'asc' },
    });

    const withVideo = lessons.filter((l) => isCaptionable(l.videoLink));

    res.json({
      status: 1,
      data: {
        total: withVideo.length,
        ready: withVideo.filter((l) => l.captionStatus === 'ready').length,
        processing: withVideo.filter((l) => l.captionStatus === 'processing').length,
        failed: withVideo.filter((l) => l.captionStatus === 'failed').length,
        pending: withVideo.filter((l) => l.captionStatus === 'none').length,
        unsupported: lessons.length - withVideo.length,
        lessons: lessons.map((l) => ({
          id: l.id,
          name: l.name,
          captionStatus: isCaptionable(l.videoLink) ? l.captionStatus : 'unsupported',
          captionError: l.captionError,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Delete ───────────────────────────────────────────────────────────────────

export const deleteProductCaptions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { productId } = req.params;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Lesson not found' });

    if (product.captionLink) {
      await spacesClient
        .send(
          new DeleteObjectCommand({
            Bucket: process.env.CF_R2_BUCKET!,
            Key: product.captionLink,
          })
        )
        .catch((e) => console.error('[CC] storage delete failed (non-fatal):', e));
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        captionStatus: 'none',
        captionLink: null,
        captionError: null,
        captionUpdatedAt: new Date(),
      },
    });

    res.json({ status: 1, message: 'Captions removed' });
  } catch (err) {
    next(err);
  }
};

// ── Student-facing: serve the VTT ────────────────────────────────────────────
// Read-only and token-gated, mirroring how the HLS manifest is served.
// Route: GET /stream/captions/:productId?token=xxx

export const serveCaptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { token } = req.query as { token?: string };

    if (!token) return res.status(401).json({ message: 'Missing token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { productId: string };
      if (payload.productId !== productId) throw new Error('Token mismatch');
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { captionLink: true, captionStatus: true },
    });

    if (!product?.captionLink || product.captionStatus !== 'ready') {
      return res.status(404).json({ message: 'No captions for this lesson' });
    }

    const vtt = await readTextFromR2(product.captionLink);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(vtt);
  } catch (err) {
    next(err);
  }
};
