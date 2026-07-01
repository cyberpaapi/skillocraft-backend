import prisma from '../db/db.config';
import { sendEmail, appUrl } from '../utils/mailer';

const BRAND = 'Skillocraft';
const PRIMARY = '#f97316';

// ─── Templates ────────────────────────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${PRIMARY};padding:18px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;">${BRAND}</span>
      </div>
      <div style="padding:24px;color:#374151;font-size:14px;line-height:1.6;">
        <h2 style="margin:0 0 12px;color:#111827;font-size:18px;">${title}</h2>
        ${body}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:12px;">
        This is an automated message from ${BRAND}. Please do not reply to this email.
      </div>
    </div>
  </div>`;
}

function itemsTable(rows: { name: string; detail?: string; amount?: string }[], total?: string): string {
  const lines = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <span style="color:#111827;font-weight:600;">${r.name}</span>
          ${r.detail ? `<br><span style="color:#6b7280;font-size:12px;">${r.detail}</span>` : ''}
        </td>
        ${r.amount ? `<td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;color:#111827;white-space:nowrap;">₹${r.amount}</td>` : '<td></td>'}
      </tr>`
    )
    .join('');
  const totalRow = total
    ? `<tr><td style="padding:12px 0 0;font-weight:bold;color:#111827;">Total Paid</td>
         <td style="padding:12px 0 0;text-align:right;font-weight:bold;color:${PRIMARY};">₹${total}</td></tr>`
    : '';
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${lines}${totalRow}</table>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function customerEmail(customerId: string): Promise<{ email: string; name: string } | null> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, user: { select: { email: true } } },
    });
    if (!c?.user?.email) return null;
    return { email: c.user.email, name: c.name || 'there' };
  } catch {
    return null;
  }
}

// ─── Purchase notifications ───────────────────────────────────────────────────

export async function notifyCoursePurchase(
  customerId: string,
  courseNames: string[],
  total: string,
  txnId?: string
): Promise<void> {
  try {
    const c = await customerEmail(customerId);
    if (!c) return;
    const body = `
      <p>Hi ${c.name}, thank you for your purchase! Your ${courseNames.length > 1 ? 'courses are' : 'course is'} ready to watch.</p>
      ${itemsTable(courseNames.map((n) => ({ name: n })), total)}
      ${txnId ? `<p style="color:#6b7280;font-size:12px;">Transaction ID: ${txnId}</p>` : ''}
      <a href="${appUrl()}/courses" style="display:inline-block;margin-top:8px;background:${PRIMARY};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;">Start Learning</a>`;
    await sendEmail({ to: c.email, subject: `Your ${BRAND} course purchase`, html: layout('Purchase confirmed 🎉', body) });
  } catch (e) {
    console.error('[mail] notifyCoursePurchase failed', e);
  }
}

export async function notifyMarketplacePurchase(
  customerId: string,
  lines: { name: string; qty: number; price: string }[],
  total: string
): Promise<void> {
  try {
    const c = await customerEmail(customerId);
    if (!c) return;
    const rows = lines.map((l) => ({ name: l.name, detail: `Qty: ${l.qty}`, amount: l.price }));
    const body = `
      <p>Hi ${c.name}, we've received your order. Here's what you bought:</p>
      ${itemsTable(rows, total)}
      <a href="${appUrl()}/marketplace" style="display:inline-block;margin-top:8px;background:${PRIMARY};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;">View Marketplace</a>`;
    await sendEmail({ to: c.email, subject: `Your ${BRAND} order is confirmed`, html: layout('Order confirmed 📦', body) });
  } catch (e) {
    console.error('[mail] notifyMarketplacePurchase failed', e);
  }
}

export async function notifyEventRegistration(
  customerId: string,
  eventTitles: string[],
  total: string
): Promise<void> {
  try {
    const c = await customerEmail(customerId);
    if (!c) return;
    const isFree = !total || parseFloat(total) <= 0;
    const body = `
      <p>Hi ${c.name}, you're registered for the following ${eventTitles.length > 1 ? 'events' : 'event'}:</p>
      ${itemsTable(eventTitles.map((t) => ({ name: t })), isFree ? undefined : total)}
      <a href="${appUrl()}/live" style="display:inline-block;margin-top:8px;background:${PRIMARY};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;">View Live Events</a>`;
    await sendEmail({ to: c.email, subject: `You're registered for a ${BRAND} event`, html: layout('Registration confirmed 🎟️', body) });
  } catch (e) {
    console.error('[mail] notifyEventRegistration failed', e);
  }
}

// ─── Referral notification ────────────────────────────────────────────────────

export async function notifyReferralUsed(referrerId: string, referredCustomerId: string): Promise<void> {
  try {
    const referrer = await customerEmail(referrerId);
    if (!referrer) return;
    const referred = await prisma.customer.findUnique({ where: { id: referredCustomerId }, select: { name: true } });
    const who = referred?.name ? `<strong>${referred.name}</strong>` : 'Someone';
    const body = `
      <p>Good news, ${referrer.name}! ${who} just signed up using your referral code and made a purchase.</p>
      <p>You'll earn referral rewards on their purchases. Track your earnings and request a payout from your referral dashboard.</p>
      <a href="${appUrl()}/referral" style="display:inline-block;margin-top:8px;background:${PRIMARY};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;">View My Earnings</a>`;
    await sendEmail({ to: referrer.email, subject: `Someone used your ${BRAND} referral code 🎉`, html: layout('You earned a referral!', body) });
  } catch (e) {
    console.error('[mail] notifyReferralUsed failed', e);
  }
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
  try {
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const body = `
      <p>Hi ${name || 'there'}, we received a request to reset your ${BRAND} password.</p>
      <p>Click the button below to set a new password. This link expires in 60 minutes. If you didn't request this, you can safely ignore this email.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:12px 0;background:${PRIMARY};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">Reset Password</a>
      <p style="color:#6b7280;font-size:12px;">Or paste this link into your browser:<br>${resetUrl}</p>`;
    await sendEmail({ to: email, subject: `Reset your ${BRAND} password`, html: layout('Password reset request', body) });
  } catch (e) {
    console.error('[mail] sendPasswordResetEmail failed', e);
  }
}
