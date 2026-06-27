import https from 'https';

/**
 * Minimal transactional-email sender built on Resend's HTTP API.
 *
 * Configure on the server via env vars:
 *   RESEND_API_KEY  — your Resend API key (re_...)
 *   MAIL_FROM       — verified sender, e.g. "Skillocraft <noreply@yourdomain.com>"
 *   APP_URL         — public site URL, used to build links (e.g. https://skillocraft.com)
 *
 * Sending never throws — a mail failure must never break a purchase or a request.
 * If RESEND_API_KEY is missing it logs a warning and no-ops, so the rest of the
 * app keeps working until the key is configured.
 */

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

const postJson = (
  url: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: chunks }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });

export async function sendEmail({ to, subject, html }: MailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Skillocraft <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[mail] RESEND_API_KEY not set — skipping email to', to);
    return;
  }
  if (!to) return;

  try {
    const { status, body } = await postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${apiKey}` },
      { from, to, subject, html }
    );
    if (status >= 400) {
      console.error('[mail] Resend responded', status, body);
    }
  } catch (err) {
    console.error('[mail] send failed:', err);
  }
}

export const appUrl = (): string =>
  (process.env.APP_URL || 'https://skillocraft.com').replace(/\/$/, '');
