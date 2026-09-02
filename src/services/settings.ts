import prisma from '../db/db.config';

/**
 * Read a value from SiteSettings, falling back to an environment variable.
 *
 * Settings edited in the admin panel win over the deployed env var, so a key
 * can be rotated without a redeploy; the env var stays as the bootstrap value.
 */
export const getSettingValue = async (
  key: string,
  envFallback?: string
): Promise<string | null> => {
  try {
    const row = await (prisma as any).siteSettings.findUnique({ where: { key } });
    const value = typeof row?.value === 'string' ? row.value.trim() : '';
    if (value) return value;
  } catch {
    // A settings lookup must never be the reason a job dies — fall back to env.
  }
  const env = envFallback ? process.env[envFallback] : undefined;
  return env && env.trim() ? env.trim() : null;
};
