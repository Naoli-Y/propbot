import { env } from '../config/env.js';
import { withRetry, HttpError } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export const sendgridEnabled = () => Boolean(env.sendgrid.apiKey && env.sendgrid.fromEmail);

const money = (n) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('en-US')}` : '—');
const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (name) => (name ? String(name).trim().split(/\s+/)[0] : 'there');

function wrapHtml(inner) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0f3d3e;color:#fff;padding:18px 28px;font-size:18px;font-weight:600">${escapeHtml(env.sendgrid.fromName)}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafb;color:#6b7680;font-size:12px">You received this because you contacted us about selling your property. Reply to this email with any questions.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Builds the seller-facing email (with a link to the seller portal when portalUrl is given). */
export function buildSellerEmail(lead, kind = 'cash_offer', { offer, note, portalUrl } = {}) {
  const mail = buildSellerEmailBody(lead, kind, { offer, note });
  if (!portalUrl) return mail;
  const label = kind === 'clarification' ? 'Track your request online' : 'View and respond to your offer online';
  return {
    subject: mail.subject,
    text: mail.text.replace('\n\nBest regards,', `\n\n${label}: ${portalUrl}\n\nBest regards,`),
    html: mail.html.replace('<p>Best regards,', `${buttonHtml(label, portalUrl)}<p>Best regards,`),
  };
}

const buttonHtml = (label, url) => `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#e98a15;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(label)}</a></p>`;

/** Confirmation sent to a seller right after they submit the public form. */
export function buildSubmissionConfirmation(lead, { reference, portalUrl }) {
  const name = firstName(lead.seller_name);
  const subject = `We received your property — ref ${reference}`;
  const text = `Hi ${name},\n\nThanks for telling us about ${lead.property_address}. Our team is reviewing it now and you'll usually hear back within one business day with a no-obligation cash offer.\n\nYour reference number: ${reference}\nTrack your request: ${portalUrl}\n\nBest regards,\n${env.sendgrid.fromName}`;
  const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p><p>Thanks for telling us about <strong>${escapeHtml(lead.property_address)}</strong>. Our team is reviewing it now and you'll usually hear back within one business day with a no-obligation cash offer.</p><p>Your reference number: <strong style="font-family:monospace">${escapeHtml(reference)}</strong></p>${buttonHtml('Track your request', portalUrl)}<p>Best regards,<br>${escapeHtml(env.sendgrid.fromName)}</p>`);
  return { subject, text, html };
}

/** "Here is your link" email for sellers who look up their offer by reference. */
export function buildPortalLinkEmail(lead, { portalUrl }) {
  const name = firstName(lead.seller_name);
  const subject = `Your link for ${lead.property_address}`;
  const text = `Hi ${name},\n\nHere is the private link to your request for ${lead.property_address}:\n${portalUrl}\n\nIf you didn't ask for this, you can ignore this email.\n\nBest regards,\n${env.sendgrid.fromName}`;
  const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p><p>Here is the private link to your request for <strong>${escapeHtml(lead.property_address)}</strong>.</p>${buttonHtml('Open my offer page', portalUrl)}<p style="color:#6b7680;font-size:13px">If you didn't ask for this, you can ignore this email.</p><p>Best regards,<br>${escapeHtml(env.sendgrid.fromName)}</p>`);
  return { subject, text, html };
}

function buildSellerEmailBody(lead, kind = 'cash_offer', { offer, note } = {}) {
  const name = firstName(lead.seller_name);
  const addr = lead.property_address;
  const offerAmount = offer ?? lead.approved_offer ?? lead.estimated_offer_max;
  const extra = note ? `<p>${escapeHtml(note)}</p>` : '';

  if (kind === 'clarification') {
    const asks = [];
    if (!lead.asking_price) asks.push('What price would you like to get for the property?');
    if (!lead.property_condition) asks.push('Could you describe the current condition (roof, HVAC, kitchen, any repairs needed)?');
    if (!lead.seller_timeline) asks.push('How soon are you hoping to sell?');
    if (!lead.square_feet) asks.push('Roughly how many square feet and bedrooms/bathrooms does it have?');
    if (!asks.length) asks.push('Are there any repairs or issues we should know about before we finalize an offer?');
    const subject = `A few quick questions about ${addr}`;
    const text = `Hi ${name},\n\nThanks for reaching out about ${addr}. To prepare a fair cash offer we just need a few details:\n\n${asks.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n${note ? `${note}\n\n` : ''}Simply reply to this email.\n\nBest regards,\n${env.sendgrid.fromName}`;
    const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p><p>Thanks for reaching out about <strong>${escapeHtml(addr)}</strong>. To prepare a fair cash offer we just need a few details:</p><ol>${asks.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ol>${extra}<p>Simply reply to this email.</p><p>Best regards,<br>${escapeHtml(env.sendgrid.fromName)}</p>`);
    return { subject, text, html };
  }

  if (kind === 'follow_up') {
    const subject = `Following up on your property at ${addr}`;
    const text = `Hi ${name},\n\nJust following up on our cash offer${offerAmount ? ` of ${money(offerAmount)}` : ''} for ${addr}. We can close on your timeline, buy as-is and cover standard closing costs.\n\n${note ? `${note}\n\n` : ''}Would you like to schedule a quick call?\n\nBest regards,\n${env.sendgrid.fromName}`;
    const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p><p>Just following up on our cash offer${offerAmount ? ` of <strong>${money(offerAmount)}</strong>` : ''} for <strong>${escapeHtml(addr)}</strong>. We can close on your timeline, buy as-is and cover standard closing costs.</p>${extra}<p>Would you like to schedule a quick call?</p><p>Best regards,<br>${escapeHtml(env.sendgrid.fromName)}</p>`);
    return { subject, text, html };
  }

  const subject = `Your cash offer for ${addr}`;
  const text = `Hi ${name},\n\nThank you for considering us for ${addr}. Based on our review, we'd like to make you an all-cash offer of ${money(offerAmount)}.\n\n- Buy as-is: no repairs or cleaning needed\n- No agent commissions or listing fees\n- Close on your timeline${lead.seller_timeline ? ` (you mentioned: ${lead.seller_timeline})` : ''}\n\n${note ? `${note}\n\n` : ''}This offer is subject to a brief walkthrough and title review. Reply to this email or call us to move forward.\n\nBest regards,\n${env.sendgrid.fromName}`;
  const html = wrapHtml(`<p>Hi ${escapeHtml(name)},</p><p>Thank you for considering us for <strong>${escapeHtml(addr)}</strong>. Based on our review, we'd like to make you an all-cash offer of:</p>
<p style="font-size:28px;font-weight:700;color:#0f3d3e;margin:18px 0">${money(offerAmount)}</p>
<ul><li>Buy as-is — no repairs or cleaning needed</li><li>No agent commissions or listing fees</li><li>Close on your timeline${lead.seller_timeline ? ` (you mentioned: ${escapeHtml(lead.seller_timeline)})` : ''}</li></ul>${extra}
<p>This offer is subject to a brief walkthrough and title review. Reply to this email to move forward.</p><p>Best regards,<br>${escapeHtml(env.sendgrid.fromName)}</p>`);
  return { subject, text, html };
}

/**
 * Sends an email through the SendGrid v3 API. When SendGrid isn't configured the
 * message is "simulated" (logged and stored) so the pipeline still works in dev/demo.
 */
export async function sendEmail({ to, subject, text, html, categories = [] }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) throw new HttpError(400, 'No recipient email address');

  if (!sendgridEnabled()) {
    logger.info('SendGrid not configured — email simulated', { to: recipients, subject });
    return { status: 'simulated', messageId: null };
  }

  const payload = {
    personalizations: [{ to: recipients.map((email) => ({ email })) }],
    from: { email: env.sendgrid.fromEmail, name: env.sendgrid.fromName },
    reply_to: { email: env.sendgrid.fromEmail, name: env.sendgrid.fromName },
    subject,
    content: [
      { type: 'text/plain', value: text },
      ...(html ? [{ type: 'text/html', value: html }] : []),
    ],
    categories: ['propbot', ...categories].slice(0, 10),
  };

  return withRetry(
    async () => {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.sendgrid.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 202 || res.ok) return { status: 'sent', messageId: res.headers.get('x-message-id') };
      let detail = '';
      try {
        const b = await res.json();
        detail = b?.errors?.map((e) => e.message).join('; ');
      } catch { /* ignore */ }
      const err = new HttpError(res.status, `SendGrid error ${res.status}${detail ? `: ${detail}` : ''}`);
      const ra = parseInt(res.headers.get('retry-after'), 10);
      if (Number.isFinite(ra)) err.retryAfter = ra;
      throw err;
    },
    { retries: 3, baseMs: 500, label: 'SendGrid send' }
  );
}

/** Internal alert to the team (DIGEST_RECIPIENTS). Never throws. */
export async function notifyTeam(subject, lines) {
  if (!env.sendgrid.digestRecipients.length) return { status: 'skipped' };
  const text = Array.isArray(lines) ? lines.join('\n') : String(lines);
  try {
    return await sendEmail({ to: env.sendgrid.digestRecipients, subject: `[PropBot] ${subject}`, text, html: `<pre style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`, categories: ['alert'] });
  } catch (err) {
    logger.warn('Team notification failed', { error: err.message });
    return { status: 'failed' };
  }
}
