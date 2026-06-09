import crypto from 'crypto';
import https from 'https';

const API_KEY    = process.env.BUNNY_API_KEY!;
const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID!;
const TOKEN_KEY  = process.env.BUNNY_TOKEN_KEY!;
const CDN_HOST   = process.env.BUNNY_CDN_HOSTNAME!; // e.g. stream.yourdomain.com

// ── Bunny Stream API helper ──────────────────────────────────────────────────

function bunnyRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: 'video.bunnycdn.com',
      path,
      method,
      headers: {
        AccessKey: API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Create a video entry & upload the file ───────────────────────────────────

export const uploadVideoToBunny = async (
  fileBuffer: Buffer,
  title: string
): Promise<string> => {
  // 1. Create the video entry → get the GUID
  const created = await bunnyRequest('POST', `/library/${LIBRARY_ID}/videos`, { title });
  if (!created.guid) throw new Error('Bunny did not return a video GUID');

  const guid: string = created.guid;

  // 2. Upload the actual file
  await new Promise<void>((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'video.bunnycdn.com',
      path: `/library/${LIBRARY_ID}/videos/${guid}`,
      method: 'PUT',
      headers: {
        AccessKey: API_KEY,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      res.resume(); // drain response
      res.on('end', () => resolve());
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });

  return guid;
};

// ── Delete a video ────────────────────────────────────────────────────────────

export const deleteVideoFromBunny = async (guid: string): Promise<void> => {
  await bunnyRequest('DELETE', `/library/${LIBRARY_ID}/videos/${guid}`);
};

// ── Get video status (useful to check if transcoding is done) ────────────────

export const getVideoStatus = async (guid: string): Promise<any> => {
  return bunnyRequest('GET', `/library/${LIBRARY_ID}/videos/${guid}`);
};

// ── Generate a signed streaming URL ──────────────────────────────────────────
// Token = base64url( SHA256( tokenKey + path + expires + clientIP ) )
// Expires in 5 minutes. IP-pinned so shared links don't work from another device.

export const getBunnySignedUrl = (guid: string, clientIP?: string, expiresInSeconds = 300): string => {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const path    = `/${guid}/playlist.m3u8`;
  const ip      = clientIP || '';

  const raw   = `${TOKEN_KEY}${path}${expires}${ip}`;
  const token = crypto
    .createHash('sha256')
    .update(raw)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const url = `https://${CDN_HOST}${path}?token=${token}&expires=${expires}`;
  return ip ? `${url}&client_ip=${encodeURIComponent(ip)}` : url;
};
