import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Lead } from '../models/Lead.js';
import { publicView as buildView, sellerStage, referenceFor, TOKEN_RE } from './portalView.js';

export { sellerStage, referenceFor, TOKEN_RE };
export const publicView = (lead) => buildView(lead, { company: env.companyName });

// ─── Seller portal helpers ──────────────────────────────────
// Sellers never get an account. Each lead has a long random token; the link
// /offer/<token> is the seller's private page to see and answer their offer.

export const newPortalToken = () => crypto.randomBytes(24).toString('base64url');

/** Base URL for links in emails: PUBLIC_APP_URL, else the browser origin, else this host. */
export function baseUrl(req) {
  if (env.publicAppUrl) return env.publicAppUrl;
  const origin = req?.get?.('origin');
  if (origin && /^https?:\/\/[^\s/]+$/.test(origin)) return origin;
  return req ? `${req.protocol}://${req.get('host')}` : '';
}

export const portalUrl = (base, token) => `${String(base || '').replace(/\/$/, '')}/offer/${token}`;

/**
 * Makes sure the lead has a portal token and returns it.
 * Leads are usually loaded without the (select:false) token, so check the DB before minting a new one.
 */
export async function ensurePortalToken(lead) {
  if (lead.portal_token) return lead.portal_token;
  if (!lead.isNew) {
    const existing = await Lead.findById(lead._id).select('+portal_token').lean();
    if (existing?.portal_token) {
      lead.portal_token = existing.portal_token;
      return existing.portal_token;
    }
  }
  lead.portal_token = newPortalToken();
  return lead.portal_token;
}

