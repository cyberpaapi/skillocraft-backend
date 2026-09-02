import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getSignedHlsUrl } from '../services/signedUrl';
import { getBunnySignedUrl } from '../services/bunnyStream';
import { getVdoCipherOTP } from '../services/vdoCipher';
import { getPresignedGetUrl } from '../services/r2Presign';
import { AuthRequest } from '../types';
import prisma from '../db/db.config';
import { getPlayableAudioTracks } from '../adminpanel/audioTracks.controller';

const BUNNY_GUID_REGEX   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VDOCIPHER_ID_REGEX = /^[0-9a-f]{32}$/i;

/**
 * Caption track for a lesson we host ourselves, if one has been generated.
 * Uses the same short-lived token as the HLS manifest so the player needs no
 * extra round trip. Students only ever read this; generation is admin-only.
 */
const captionFields = async (productId: string | undefined, token: string) => {
  if (!productId) return {};
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { captionStatus: true, captionLink: true },
  });
  if (product?.captionStatus !== 'ready' || !product.captionLink) return {};
  return { captionUrl: `/stream/captions/${productId}?token=${token}` };
};

/** Alternate-language audio for the player's track selector, if any exists. */
const audioTrackFields = async (productId: string | undefined) => {
  if (!productId) return {};
  const tracks = await getPlayableAudioTracks(productId);
  return tracks.length ? { audioTracks: tracks } : {};
};

export const streamChunkVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const decoded = decodeURIComponent(req.params.key);
    const key     = decoded.trim();

    // ── VdoCipher ────────────────────────────────────────────────────────────
    if (VDOCIPHER_ID_REGEX.test(key)) {
      let watermark: { name?: string; email?: string } | undefined;
      if (req.user?.id) {
        try {
          const [user, customer] = await Promise.all([
            prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } }),
            prisma.customer.findFirst({ where: { userId: req.user.id }, select: { name: true } }),
          ]);
          if (user || customer) watermark = { name: customer?.name ?? undefined, email: user?.email ?? undefined };
        } catch { /* non-critical */ }
      }
      const { otp, playbackInfo } = await getVdoCipherOTP(key, watermark);
      return res.json({ otp, playbackInfo, provider: 'vdocipher' });
    }

    // ── Bunny GUID ───────────────────────────────────────────────────────────
    if (BUNNY_GUID_REGEX.test(key)) {
      const clientIP = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
        || req.socket.remoteAddress;
      const url = getBunnySignedUrl(key, clientIP);
      return res.json({ url, provider: 'bunny' });
    }

    // ── R2 raw MP4 ───────────────────────────────────────────────────────────
    if (key.startsWith('videos/raw/')) {
      const url = await getPresignedGetUrl(key, 5 * 60);
      const productId = key.split('/')[2]?.replace(/\.[^.]+$/, '');
      const token = jwt.sign({ productId }, process.env.JWT_SECRET!, { expiresIn: '30m' });
      return res.json({
        url,
        provider: 'r2-mp4',
        ...(await captionFields(productId, token)),
        ...(await audioTrackFields(productId)),
      });
    }

    // ── R2 HLS — return a manifest URL with a short-lived token ──────────────
    if (key.startsWith('videos/hls/')) {
      // Extract productId from key: videos/hls/{productId}/index.m3u8
      const productId = key.split('/')[2];
      const token = jwt.sign({ productId }, process.env.JWT_SECRET!, { expiresIn: '30m' });
      const manifestUrl = `/stream/hls/${productId}?token=${token}`;
      return res.json({
        url: manifestUrl,
        provider: 'r2-hls',
        ...(await captionFields(productId, token)),
        ...(await audioTrackFields(productId)),
      });
    }

    // ── Direct URL ───────────────────────────────────────────────────────────
    if (key.startsWith('https://') || key.startsWith('http://')) {
      return res.json({ url: key, provider: 'direct' });
    }

    // ── Legacy DO Spaces key → presigned URL ─────────────────────────────────
    const signedUrl = await getSignedHlsUrl(key);
    res.json({ url: signedUrl, provider: 'spaces' });
  } catch (err) {
    next(err);
  }
};
