import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { spacesClient } from '../config/spaces';
import { downloadFromR2, readTextFromR2 } from './r2Presign';
import { getSettingValue } from './settings';

// ── Config ───────────────────────────────────────────────────────────────────
// Whisper rejects uploads over 25MB. We transcode to mono 16kHz 32kbps MP3
// (~14MB/hour) and segment at 45 minutes, so every chunk lands well under the
// limit while keeping the number of billed requests as low as possible.
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'whisper-1'; // only Whisper returns VTT with timestamps
const CHUNK_SECONDS = 45 * 60;
const MAX_RETRIES = 3;

const RAW_VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'];

export class CaptionError extends Error {}

// ── R2 helpers ───────────────────────────────────────────────────────────────

async function existsInR2(key: string): Promise<boolean> {
  try {
    await spacesClient.send(
      new HeadObjectCommand({ Bucket: process.env.CF_R2_BUCKET!, Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a local media file we can feed to ffmpeg.
 *
 * Preference order:
 *   1. the original upload at videos/raw/<productId>.<ext> — cheapest and exact
 *   2. videoLink itself, when it is still a plain file (not yet HLS-converted)
 *   3. the HLS rendition — segments are private, so they are pulled individually
 *      and concatenated. This is the path older courses take, since HLS
 *      conversion replaces videoLink with the .m3u8 key.
 */
async function materializeMedia(
  productId: string,
  videoLink: string,
  workDir: string
): Promise<string> {
  for (const ext of RAW_VIDEO_EXTS) {
    const rawKey = `videos/raw/${productId}${ext}`;
    if (await existsInR2(rawKey)) {
      const dest = path.join(workDir, `source${ext}`);
      await downloadFromR2(rawKey, dest);
      return dest;
    }
  }

  if (!videoLink.endsWith('.m3u8')) {
    if (await existsInR2(videoLink)) {
      const dest = path.join(workDir, `source${path.extname(videoLink) || '.mp4'}`);
      await downloadFromR2(videoLink, dest);
      return dest;
    }
    throw new CaptionError(`Source video not found in storage (${videoLink})`);
  }

  // HLS fallback: fetch every segment listed in the manifest, then concat.
  const manifest = await readTextFromR2(videoLink);
  const hlsFolder = videoLink.replace(/\/[^/]+\.m3u8$/, '');
  const segments = manifest
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (segments.length === 0) {
    throw new CaptionError('HLS manifest contains no segments');
  }

  const segDir = path.join(workDir, 'segments');
  await fs.ensureDir(segDir);

  const localSegments: string[] = [];
  for (const [i, seg] of segments.entries()) {
    const local = path.join(segDir, `seg${String(i).padStart(5, '0')}.ts`);
    await downloadFromR2(`${hlsFolder}/${seg}`, local);
    localSegments.push(local);
  }

  // ffmpeg concat demuxer needs a list file with escaped paths
  const listFile = path.join(workDir, 'segments.txt');
  await fs.writeFile(
    listFile,
    localSegments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  );
  return `concat:${listFile}`;
}

// ── Audio extraction ─────────────────────────────────────────────────────────

/** Transcode to small mono MP3 chunks. Returns chunk paths in playback order. */
async function extractAudioChunks(mediaPath: string, outDir: string): Promise<string[]> {
  await fs.ensureDir(outDir);
  const pattern = path.join(outDir, 'chunk%03d.mp3');

  const isConcatList = mediaPath.startsWith('concat:');
  const input = isConcatList ? mediaPath.slice('concat:'.length) : mediaPath;

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(input);
    if (isConcatList) cmd.inputOptions(['-f concat', '-safe 0']);
    cmd
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('32k')
      .outputOptions(['-f segment', `-segment_time ${CHUNK_SECONDS}`, '-reset_timestamps 1'])
      .output(pattern)
      .on('end', () => resolve())
      .on('error', (err) => reject(new CaptionError(`Audio extraction failed: ${err.message}`)))
      .run();
  });

  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith('chunk') && f.endsWith('.mp3'))
    .sort();

  if (files.length === 0) {
    throw new CaptionError('No audio track found in this video');
  }
  return files.map((f) => path.join(outDir, f));
}

// ── OpenAI transcription ─────────────────────────────────────────────────────

async function transcribeChunk(filePath: string, apiKey: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', TRANSCRIBE_MODEL);
    form.append('response_format', 'vtt');
    form.append('language', 'en');

    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (res.ok) return await res.text();

    const body = await res.text().catch(() => '');
    lastError = `OpenAI ${res.status}: ${body.slice(0, 300)}`;

    // 401/400 are permanent — retrying only wastes time, never credits.
    if (res.status === 401 || res.status === 403 || res.status === 400) {
      throw new CaptionError(lastError);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new CaptionError(lastError || 'Transcription failed');
}

// ── VTT stitching ────────────────────────────────────────────────────────────

function shiftTimestamp(stamp: string, offsetSeconds: number): string {
  const m = stamp.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (!m) return stamp;
  const [, h = '0', mm, ss, ms] = m;
  const total =
    Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000 + offsetSeconds;

  const hh = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  return `${String(hh).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}.${String(millis).padStart(3, '0')}`;
}

/** Concatenate per-chunk VTTs, shifting each chunk's cues by its start offset. */
function mergeVtt(parts: string[], chunkSeconds: number): string {
  const out: string[] = ['WEBVTT', ''];

  parts.forEach((part, index) => {
    const offset = index * chunkSeconds;
    const lines = part.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'WEBVTT' || trimmed.startsWith('NOTE')) continue;

      const cue = trimmed.match(/^(\S+)\s+-->\s+(\S+)(.*)$/);
      if (cue) {
        out.push(`${shiftTimestamp(cue[1], offset)} --> ${shiftTimestamp(cue[2], offset)}${cue[3]}`);
      } else if (/^\d+$/.test(trimmed)) {
        // drop per-chunk cue numbering; renumbering is unnecessary for playback
        continue;
      } else {
        out.push(line);
      }
    }
    out.push('');
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Transcribe a lesson's video to English WebVTT.
 * Returns the VTT text; the caller decides where to store it.
 */
export async function generateEnglishCaptions(
  productId: string,
  videoLink: string
): Promise<string> {
  // Resolved once per job: the admin panel setting wins, env is the fallback.
  const apiKey = await getSettingValue('openai_api_key', 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new CaptionError(
      'No OpenAI API key configured. Add one under Site Settings, or set OPENAI_API_KEY.'
    );
  }

  const workDir = path.join(process.cwd(), 'temp', 'captions', productId);
  await fs.ensureDir(workDir);

  try {
    console.log(`[CC] ${productId}: fetching source media`);
    const mediaPath = await materializeMedia(productId, videoLink, workDir);

    console.log(`[CC] ${productId}: extracting audio`);
    const chunks = await extractAudioChunks(mediaPath, path.join(workDir, 'audio'));

    console.log(`[CC] ${productId}: transcribing ${chunks.length} chunk(s)`);
    const parts: string[] = [];
    for (const chunk of chunks) {
      parts.push(await transcribeChunk(chunk, apiKey));
    }

    const vtt = mergeVtt(parts, CHUNK_SECONDS);
    if (!vtt.includes('-->')) {
      throw new CaptionError('Transcription produced no speech cues');
    }
    console.log(`[CC] ${productId}: done`);
    return vtt;
  } finally {
    await fs.remove(workDir).catch(() => {});
  }
}
