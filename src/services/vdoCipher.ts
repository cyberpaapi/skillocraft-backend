import https from 'https';
import FormData from 'form-data';

const API_SECRET = process.env.VDOCIPHER_API_SECRET!;
const API_BASE   = 'dev.vdocipher.com';

// ── Generic HTTPS helper ─────────────────────────────────────────────────────

function vdoRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: API_BASE,
      path,
      method,
      headers: {
        Authorization: `Apisecret ${API_SECRET}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
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

// ── Step 1: Create a video slot → get upload credentials ────────────────────

async function createVideoSlot(title: string): Promise<{ videoId: string; clientPayload: any }> {
  const result = await vdoRequest('PUT', `/api/videos?title=${encodeURIComponent(title)}`);
  if (!result.videoId) throw new Error(`VdoCipher slot creation failed: ${JSON.stringify(result)}`);
  return { videoId: result.videoId, clientPayload: result.clientPayload };
}

// ── Step 2: Upload file to VdoCipher's S3 bucket ────────────────────────────

async function uploadToVdoCipherS3(buffer: Buffer, filename: string, payload: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    // Fields required by VdoCipher's S3 policy (order matters)
    const fields = ['policy', 'key', 'x-amz-signature', 'x-amz-algorithm',
                    'x-amz-date', 'x-amz-credential', 'context',
                    'content-type', 'success_action_status'];

    for (const field of fields) {
      if (payload[field] !== undefined) form.append(field, payload[field]);
    }

    form.append('success_action_redirect', '');
    form.append('file', buffer, {
      filename,
      contentType: payload['content-type'] || 'video/mp4',
    });

    // Extract hostname + path from uploadLink
    const uploadUrl = new URL(payload.uploadLink);
    const requestOptions: https.RequestOptions = {
      hostname: uploadUrl.hostname,
      path: uploadUrl.pathname,
      method: 'POST',
      headers: form.getHeaders(),
    };

    const req = https.request(requestOptions, (res) => {
      res.resume();
      // VdoCipher S3 returns 204 on success
      if (res.statusCode && res.statusCode < 300) resolve();
      else reject(new Error(`S3 upload failed with status ${res.statusCode}`));
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

// ── Public: Upload a video to VdoCipher ─────────────────────────────────────

export const uploadVideoToVdoCipher = async (
  buffer: Buffer,
  title: string
): Promise<string> => {
  const { videoId, clientPayload } = await createVideoSlot(title);
  await uploadToVdoCipherS3(buffer, `${title}.mp4`, clientPayload);
  return videoId;
};

// ── Public: Generate OTP for playback ───────────────────────────────────────
// annotate = student info to watermark on the video (name + email)

export const getVdoCipherOTP = async (
  videoId: string,
  watermark?: { name?: string; email?: string }
): Promise<{ otp: string; playbackInfo: string }> => {
  const body: any = {};

  if (watermark?.name || watermark?.email) {
    const label = [watermark.name, watermark.email].filter(Boolean).join(' | ');
    body.annotate = JSON.stringify([{
      type: 'rtext',
      text: label,
      alpha: '0.5',
      color: '0xFFFFFF',
      size: '14',
      interval: '5000', // moves every 5 seconds
    }]);
  }

  const result = await vdoRequest('POST', `/api/videos/${videoId}/otp`, body);
  if (!result.otp) throw new Error(`OTP generation failed: ${JSON.stringify(result)}`);

  return { otp: result.otp, playbackInfo: result.playbackInfo };
};

// ── Public: Delete a video ───────────────────────────────────────────────────

export const deleteVideoFromVdoCipher = async (videoId: string): Promise<void> => {
  await vdoRequest('DELETE', `/api/videos?videos=${videoId}`);
};
