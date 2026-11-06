import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { Lead } from '../models/Lead.js';
import { asyncHandler } from '../middleware/errors.js';
import { normalizeLead, cleanString, normalizeEmail, parseMoney } from '../utils/normalize.js';
import { processLead } from '../services/pipeline.js';
import { sendEmail, notifyTeam, buildSubmissionConfirmation, buildPortalLinkEmail } from '../services/email.js';
import { baseUrl, ensurePortalToken, portalUrl, publicView, referenceFor, TOKEN_RE } from '../services/portal.js';
import { logger } from '../utils/logger.js';

// Public endpoints (no login): the "Sell your house" website and the seller portal.
const router = Router();

const limiter = (limit, minutes = 15) => rateLimit({
  windowMs: minutes * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a few minutes.' },
});

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const fireAndForget = (p, label) => Promise.resolve(p).catch((err) => logger.warn(`${label} failed`, { error: err.message }));

router.get('/public/config', (_req, res) => res.json({ company: env.companyName }));

// ─── Seller submits their property ───────────────────────────
router.post(
  '/public/leads',
  limiter(8),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    // Honeypot: bots fill hidden fields. Pretend success, store nothing.
    if (body.company_website) return res.status(201).json({ reference: 'RECEIVED', path: null });
    if (body.consent !== true) return res.status(400).json({ error: 'Please agree to be contacted about your property.' });

    const { data, errors } = normalizeLead({ ...body, source: 'website' }, { defaultSource: 'website' });
    if (!data) return res.status(400).json({ error: 'Invalid submission' });
    data.source = 'website';
    if (!data.seller_name) errors.push('Your name is required');
    if (!data.seller_email) errors.push('A valid email address is required');
    if (errors.length) return res.status(400).json({ error: 'Please check the form', details: [...new Set(errors)] });

    // Same seller + same address within 30 days → reuse the existing request.
    const dup = await Lead.findOne({
      seller_email: data.seller_email,
      property_address: data.property_address,
      created_at: { $gte: new Date(Date.now() - 30 * 86400000) },
    }).select('+portal_token');
    if (dup) {
      await ensurePortalToken(dup);
      if (dup.isModified()) await dup.save();
      return res.status(200).json({ reference: referenceFor(dup), path: `/offer/${dup.portal_token}`, duplicate: true });
    }

    const lead = new Lead({ ...data, contact_consent: true, status: 'Inbound', tags: ['website'] });
    lead.timeline.push({ type: 'created', actor: 'seller', message: 'Submitted through the public "Sell your house" website' });
    await ensurePortalToken(lead);
    await processLead(lead, { actor: 'system' });
    await lead.save();

    const reference = referenceFor(lead);
    const link = portalUrl(baseUrl(req), lead.portal_token);
    fireAndForget(sendEmail({ to: lead.seller_email, ...buildSubmissionConfirmation(lead, { reference, portalUrl: link }), categories: ['confirmation'] }), 'Seller confirmation email');
    fireAndForget(notifyTeam(`New website lead ${reference} · score ${lead.viability_score ?? '—'}`, [
      `${lead.property_address}`,
      `Seller: ${lead.seller_name} <${lead.seller_email}>${lead.seller_phone ? ` · ${lead.seller_phone}` : ''}`,
      `Asking: ${lead.asking_price ? money(lead.asking_price) : 'not given'} · Timeline: ${lead.seller_timeline || '—'}`,
      `Score ${lead.viability_score ?? '—'}/100 · Stage: ${lead.status}`,
    ]), 'Team alert');

    res.status(201).json({ reference, path: `/offer/${lead.portal_token}` });
  })
);

// ─── Seller portal ───────────────────────────────────────────
const loadByToken = asyncHandler(async (req, res, next) => {
  const token = String(req.params.token || '');
  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  const lead = await Lead.findOne({ portal_token: token }).select('+portal_token');
  if (!lead) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  req.lead = lead;
  next();
});

router.get('/portal/:token', limiter(120), loadByToken, (req, res) => res.json(publicView(req.lead)));

router.post(
  '/portal/:token/respond',
  limiter(20),
  loadByToken,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    const action = req.body?.action;
    const statusFor = { accept: 'accepted', decline: 'declined', counter: 'countered' };
    if (!statusFor[action]) return res.status(400).json({ error: 'Choose accept, decline or counter.' });
    if (lead.status !== 'Outreach Sent' || !lead.approved_offer) return res.status(409).json({ error: 'There is no active offer to respond to yet.' });
    const current = lead.seller_response?.status;
    if (current === 'accepted' || current === 'declined') {
      return res.status(409).json({ error: `You already ${current} this offer. Reply to our email if anything has changed.` });
    }

    const message = cleanString(req.body?.message, 1000);
    let counter;
    if (action === 'counter') {
      counter = parseMoney(req.body?.counter_offer);
      if (!counter || counter < 1000 || counter > 1e9) return res.status(400).json({ error: 'Enter the price you would accept.' });
    }

    const entry = { status: statusFor[action], offer_amount: lead.approved_offer, counter_offer: counter, message, responded_at: new Date() };
    lead.seller_response = entry;
    lead.seller_responses.push(entry);
    const summary = action === 'counter'
      ? `Seller countered at ${money(counter)} (offer was ${money(lead.approved_offer)})`
      : `Seller ${entry.status} the ${money(lead.approved_offer)} offer`;
    lead.timeline.push({ type: 'seller_response', actor: 'seller', message: message ? `${summary} — "${message}"` : summary });
    await lead.save();

    fireAndForget(notifyTeam(`${summary} · ${lead.property_address}`, [
      summary,
      `Property: ${lead.property_address}`,
      `Seller: ${lead.seller_name || '—'} <${lead.seller_email || '—'}>${lead.seller_phone ? ` · ${lead.seller_phone}` : ''}`,
      message ? `Message: ${message}` : '',
    ].filter(Boolean)), 'Team alert');

    res.json(publicView(lead));
  })
);

// "I lost my link": email + reference → we email the link (never reveal whether it matched).
router.post(
  '/portal/lookup',
  limiter(6),
  asyncHandler(async (req, res) => {
    const generic = { ok: true, message: "If we find a matching request, we'll email you a link to your offer page within a few minutes." };
    const email = normalizeEmail(req.body?.email);
    const ref = String(req.body?.reference || '').trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    if (!email || ref.length !== 8) return res.json(generic);
    const leads = await Lead.find({ seller_email: email }).select('+portal_token').sort({ created_at: -1 }).limit(50);
    const lead = leads.find((l) => String(l._id).endsWith(ref));
    if (lead) {
      await ensurePortalToken(lead);
      if (lead.isModified()) await lead.save();
      const link = portalUrl(baseUrl(req), lead.portal_token);
      fireAndForget(sendEmail({ to: email, ...buildPortalLinkEmail(lead, { portalUrl: link }), categories: ['portal-link'] }), 'Portal link email');
    }
    res.json(generic);
  })
);

export default router;
