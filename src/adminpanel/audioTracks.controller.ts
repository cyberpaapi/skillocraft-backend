import { Response, NextFunction } from 'express';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { getPresignedPutUrl, getPresignedGetUrl, deleteFromR2 } from '../services/r2Presign';

const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ status: 0, message: 'Only an admin can manage audio tracks' });
    return false;
  }
  return true;
};

const normalizeLanguage = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

/**
 * Propose the next variant name for a language already used on this lesson.
 * "Hindi" -> "Hindi 2", and if that exists too -> "Hindi 3", so the admin can
 * keep a second reading/dub of the same language as its own track.
 */
async function suggestVariantName(productId: string, language: string): Promise<string> {
  const base = language.replace(/\s+\d+$/, '');
  const existing = await prisma.productAudioTrack.findMany({
    where: { productId },
    select: { language: true },
  });
  const taken = new Set(existing.map((t) => t.language.toLowerCase()));

  for (let n = 2; n < 50; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

const duplicateResponse = async (res: Response, productId: string, language: string) => {
  const suggestion = await suggestVariantName(productId, language);
  return res.status(409).json({
    status: 0,
    code: 'DUPLICATE_LANGUAGE',
    message: `This lesson already has a ${language} audio track.`,
    hint: `To add another ${language} version, use "New Language" in the dropdown and name it "${suggestion}".`,
    suggestion,
  });
};

// ── Languages ────────────────────────────────────────────────────────────────

export const listLanguages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const languages = await prisma.language.findMany({ orderBy: { name: 'asc' } });
    res.json({ status: 1, data: languages });
  } catch (err) {
    next(err);
  }
};

/** Adds a language to the reusable dropdown list. */
export const createLanguage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const name = normalizeLanguage(req.body?.name);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() || null : null;

    if (!name) return res.status(400).json({ status: 0, message: 'Language name is required' });
    if (name.length > 60) {
      return res.status(400).json({ status: 0, message: 'Language name is too long' });
    }

    const existing = await prisma.language.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      return res.json({ status: 1, message: 'Language already available', data: existing });
    }

    const language = await prisma.language.create({ data: { name, code } });
    res.status(201).json({ status: 1, message: 'Language added', data: language });
  } catch (err) {
    next(err);
  }
};

// ── Tracks ───────────────────────────────────────────────────────────────────

export const listAudioTracks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const tracks = await prisma.productAudioTrack.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ status: 1, data: tracks });
  } catch (err) {
    next(err);
  }
};

/**
 * Step 1 of adding a track: check the language is free, then hand back a
 * presigned PUT so the browser uploads straight to R2 (audio never passes
 * through this server).
 */
export const getAudioUploadUrl = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { productId } = req.params;
    const language = normalizeLanguage(req.body?.language);
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : '';
    const contentType =
      typeof req.body?.contentType === 'string' && req.body.contentType
        ? req.body.contentType
        : 'audio/mpeg';

    if (!language) return res.status(400).json({ status: 0, message: 'Language is required' });
    if (!fileName) return res.status(400).json({ status: 0, message: 'fileName is required' });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Lesson not found' });

    const clash = await prisma.productAudioTrack.findFirst({
      where: { productId, language: { equals: language, mode: 'insensitive' } },
    });
    if (clash) return duplicateResponse(res, productId, language);

    const ext = path.extname(fileName).toLowerCase() || '.mp3';
    const safeLang = language.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const key = `audio/${productId}/${safeLang}-${Date.now()}${ext}`;

    const putUrl = await getPresignedPutUrl(key, contentType);
    res.json({ status: 1, putUrl, key });
  } catch (err) {
    next(err);
  }
};

/** Step 2: record the uploaded track. The unique index is the real guard. */
export const createAudioTrack = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { productId } = req.params;
    const language = normalizeLanguage(req.body?.language);
    const key = typeof req.body?.key === 'string' ? req.body.key : '';

    if (!language) return res.status(400).json({ status: 0, message: 'Language is required' });
    if (!key) return res.status(400).json({ status: 0, message: 'Upload key is required' });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Lesson not found' });

    try {
      const track = await prisma.productAudioTrack.create({
        data: { productId, language, audioLink: key },
      });

      // Keep the dropdown list in step with what has actually been used.
      await prisma.language
        .upsert({ where: { name: language }, update: {}, create: { name: language } })
        .catch(() => {});

      res.status(201).json({ status: 1, message: 'Audio track added', data: track });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Lost a race against a concurrent add — clean up the orphaned object.
        await deleteFromR2(key).catch(() => {});
        return duplicateResponse(res, productId, language);
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

export const deleteAudioTrack = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { trackId } = req.params;
    const track = await prisma.productAudioTrack.findUnique({ where: { id: trackId } });
    if (!track) return res.status(404).json({ status: 0, message: 'Audio track not found' });

    // Storage cleanup is best-effort; the row must go regardless.
    await deleteFromR2(track.audioLink).catch((e) =>
      console.error('[audio] storage delete failed (non-fatal):', e)
    );

    await prisma.productAudioTrack.delete({ where: { id: trackId } });
    res.json({ status: 1, message: 'Audio track removed' });
  } catch (err) {
    next(err);
  }
};

// ── Student-facing ───────────────────────────────────────────────────────────

/** Presigned URLs for a lesson's alternate audio, used by the player's selector. */
export const getPlayableAudioTracks = async (
  productId: string
): Promise<{ id: string; language: string; url: string }[]> => {
  const tracks = await prisma.productAudioTrack.findMany({
    where: { productId },
    orderBy: { createdAt: 'asc' },
  });

  return Promise.all(
    tracks.map(async (t) => ({
      id: t.id,
      language: t.language,
      url: await getPresignedGetUrl(t.audioLink, 30 * 60),
    }))
  );
};
