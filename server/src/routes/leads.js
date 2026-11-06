import { Router } from 'express';
import multer from 'multer';
import { Lead } from '../models/Lead.js';
import { env } from '../config/env.js';
import { asyncHandler, validateObjectId } from '../middleware/errors.js';
import { requireUser, requireUserOrApiKey, requireWriter, requireApprover } from '../middleware/auth.js';
import { normalizeLead, cleanString, parseMoney } from '../utils/normalize.js';
import { parseCsv, toCsv } from '../utils/csv.js';
import { processLead, sendOutreach } from '../services/pipeline.js';
import { transition, STATUSES, TRANSITIONS } from '../services/stateMachine.js';
import { buildSellerEmail } from '../services/email.js';
import { enqueueLeads, queueStatus } from '../services/queue.js';
import { baseUrl, ensurePortalToken, portalUrl } from '../services/portal.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname) || /csv|text\/plain|excel/.test(file.mimetype);
    cb(ok ? null : Object.assign(new Error('Only .csv files are accepted'), { status: 400 }), ok);
  },
});

const MAX_IMPORT_ROWS = 1000;
const EDITABLE = ['property_address', 'seller_name', 'seller_email', 'seller_phone', 'asking_price', 'property_condition', 'seller_timeline', 'property_type', 'bedrooms', 'bathrooms', 'square_feet', 'year_built', 'source'];
const UNDERWRITING_INPUTS = ['property_address', 'asking_price', 'property_condition', 'seller_timeline', 'property_type', 'bedrooms', 'bathrooms', 'square_feet', 'year_built'];

const loadLead = asyncHandler(async (req, res, next) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  req.lead = lead;
  next();
});

// ─────────────────────────────────────────────────────────────
// Ingestion: POST /api/leads  (dashboard JWT or webhook x-api-key)
// Accepts a single lead object, or { leads: [...] } for small batches (≤ 25).
// ─────────────────────────────────────────────────────────────
const ingest = asyncHandler(async (req, res) => {
    const defaultSource = req.viaApiKey ? 'webhook' : 'manual';
    const items = Array.isArray(req.body?.leads) ? req.body.leads : [req.body];
    if (items.length > 25) return res.status(413).json({ error: 'Max 25 leads per request — use CSV import for larger batches' });

    const results = [];
    for (const raw of items) {
      const { data, errors } = normalizeLead(raw, { defaultSource });
      if (errors.length) {
        results.push({ ok: false, errors, input: raw?.property_address || raw?.address });
        continue;
      }
      const externalId = cleanString(raw.external_id ?? raw.externalId ?? raw.listing_id, 120);
      if (externalId) {
        const existing = await Lead.findOne({ external_id: externalId, source: data.source });
        if (existing) {
          results.push({ ok: true, duplicate: true, lead: existing });
          continue;
        }
      }
      const lead = new Lead({ ...data, external_id: externalId, status: 'Inbound' });
      lead.timeline.push({ type: 'created', actor: req.actor, message: `Lead received via ${data.source}` });
      await processLead(lead, { actor: 'system' });
      await lead.save();
      results.push({ ok: true, lead });
    }

    if (!Array.isArray(req.body?.leads)) {
      const r = results[0];
      if (!r.ok) return res.status(400).json({ error: 'Validation failed', details: r.errors });
      return res.status(r.duplicate ? 200 : 201).json({ id: r.lead.id, duplicate: Boolean(r.duplicate), lead: r.lead });
    }
    const created = results.filter((r) => r.ok && !r.duplicate).length;
    return res.status(created ? 201 : 200).json({
      created,
      duplicates: results.filter((r) => r.duplicate).length,
      failed: results.filter((r) => !r.ok).length,
      results: results.map((r) => (r.ok ? { ok: true, id: r.lead.id, duplicate: Boolean(r.duplicate), viability_score: r.lead.viability_score, status: r.lead.status } : r)),
    });
});

router.post('/', requireUserOrApiKey, ingest);
// Alias that reads more naturally for external integrations.
router.post('/webhook', requireUserOrApiKey, ingest);

// Everything below is dashboard-only.
router.use(requireUser);

// ─── CSV bulk import ─────────────────────────────────────────
router.get('/import/template.csv', (_req, res) => {
  const csv = [
    'property_address,seller_name,seller_email,seller_phone,asking_price,property_condition,seller_timeline,property_type,bedrooms,bathrooms,square_feet,year_built,external_id',
    '"1600 Pennsylvania Ave NW, Washington, DC 20500",Jane Seller,jane@example.com,555-123-4567,350000,"Roof leaks, outdated kitchen, HVAC is 20 years old",ASAP,Single Family,3,2,1650,1978,LIST-001',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="propbot-import-template.csv"');
  res.send(csv);
});

router.post(
  '/import',
  requireWriter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Attach a CSV file in the "file" field' });
    const { headers, records } = parseCsv(req.file.buffer.toString('utf8'));
    if (!records.length) return res.status(400).json({ error: 'CSV contains no data rows' });
    if (records.length > MAX_IMPORT_ROWS) return res.status(413).json({ error: `Max ${MAX_IMPORT_ROWS} rows per import` });
    const campaign = cleanString(req.body?.campaign, 60);

    const docs = [];
    const errors = [];
    const seen = new Set();
    records.forEach((raw, i) => {
      const { data, errors: errs } = normalizeLead(raw, { defaultSource: 'csv' });
      if (errs.length) return errors.push({ row: i + 2, errors: errs });
      const externalId = cleanString(raw.external_id || raw.listing_id, 120);
      const dedupeKey = externalId ? `id:${externalId}` : `addr:${data.property_address.toLowerCase()}`;
      if (seen.has(dedupeKey)) return errors.push({ row: i + 2, errors: ['Duplicate row in file'] });
      seen.add(dedupeKey);
      docs.push({
        ...data,
        external_id: externalId,
        tags: campaign ? [campaign] : [],
        status: 'Inbound',
        timeline: [{ type: 'created', actor: req.actor, message: `Imported from CSV${campaign ? ` (campaign: ${campaign})` : ''} · row ${i + 2}` }],
      });
    });

    // Skip rows whose external_id already exists.
    const ids = docs.map((d) => d.external_id).filter(Boolean);
    const existing = ids.length ? new Set((await Lead.find({ external_id: { $in: ids } }, 'external_id').lean()).map((l) => l.external_id)) : new Set();
    const fresh = docs.filter((d) => !d.external_id || !existing.has(d.external_id));

    let inserted = [];
    if (fresh.length) {
      try {
        inserted = await Lead.insertMany(fresh, { ordered: false });
      } catch (err) {
        // Partial success (e.g. a concurrent import inserted the same external_id) — keep what went in.
        if (!err.insertedDocs) throw err;
        inserted = err.insertedDocs;
      }
    }
    enqueueLeads(inserted.map((l) => l._id), `csv:${req.actor}`);

    res.status(202).json({
      headers,
      totalRows: records.length,
      imported: inserted.length,
      skippedExisting: docs.length - fresh.length,
      invalid: errors.length,
      errors: errors.slice(0, 100),
      message: `${inserted.length} lead(s) queued for AI underwriting`,
    });
  })
);

router.get('/import/status', (_req, res) => res.json(queueStatus()));

// ─── Export ──────────────────────────────────────────────────
function buildFilter(q) {
  const filter = {};
  if (q.status) {
    const statuses = String(q.status).split(',').filter((s) => STATUSES.includes(s));
    if (statuses.length) filter.status = { $in: statuses };
  }
  if (q.priority) filter.priority = { $in: String(q.priority).split(',') };
  if (q.stale === 'true') filter.is_stale = true;
  if (q.source) filter.source = String(q.source);
  if (q.engine) filter.underwriting_engine = String(q.engine);
  if (q.response) filter['seller_response.status'] = { $in: String(q.response).split(',') };
  const minScore = parseInt(q.minScore, 10);
  const maxScore = parseInt(q.maxScore, 10);
  if (Number.isFinite(minScore) || Number.isFinite(maxScore)) {
    filter.viability_score = {};
    if (Number.isFinite(minScore)) filter.viability_score.$gte = minScore;
    if (Number.isFinite(maxScore)) filter.viability_score.$lte = maxScore;
  }
  if (q.q) {
    const rx = new RegExp(String(q.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100), 'i');
    filter.$or = [{ property_address: rx }, { seller_name: rx }, { seller_email: rx }, { formatted_address: rx }, { tags: rx }];
  }
  if (q.from || q.to) {
    filter.created_at = {};
    if (q.from) filter.created_at.$gte = new Date(q.from);
    if (q.to) filter.created_at.$lte = new Date(q.to);
  }
  return filter;
}

const SORTS = {
  newest: { created_at: -1 },
  oldest: { created_at: 1 },
  score: { viability_score: -1, created_at: -1 },
  score_asc: { viability_score: 1 },
  price: { asking_price: -1 },
  price_asc: { asking_price: 1 },
  updated: { updated_at: -1 },
};

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const leads = await Lead.find(buildFilter(req.query)).sort(SORTS[req.query.sort] || SORTS.newest).limit(10000).lean({ virtuals: false });
    const csv = toCsv(leads, [
      { key: '_id', label: 'id' },
      { key: 'status' }, { key: 'viability_score' }, { key: 'priority' },
      { key: 'property_address' }, { key: 'seller_name' }, { key: 'seller_email' }, { key: 'seller_phone' },
      { key: 'asking_price' }, { key: 'estimated_market_value' }, { key: 'after_repair_value' }, { key: 'estimated_repair_cost' },
      { key: 'estimated_offer_min' }, { key: 'estimated_offer_max' }, { key: 'approved_offer' },
      { key: 'seller_timeline' }, { key: 'property_condition' },
      { key: 'latitude' }, { key: 'longitude' }, { key: 'underwriting_engine' }, { key: 'source' },
      { key: 'defects', get: (l) => (l.defects || []).map((d) => d.item).join('; ') },
      { key: 'ai_reasoning' }, { key: 'created_at' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="propbot-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${csv}`);
  })
);

// ─── List / board ────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = buildFilter(req.query);
    const projection = req.query.view === 'board' ? '-timeline -outreach -ai_reasoning -property_condition' : '-timeline -outreach.body';
    const [items, total] = await Promise.all([
      Lead.find(filter, projection).sort(SORTS[req.query.sort] || SORTS.newest).skip((page - 1) * limit).limit(limit),
      Lead.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  })
);

router.get('/meta/statuses', (_req, res) => res.json({ statuses: STATUSES, transitions: TRANSITIONS, threshold: env.rules.viabilityThreshold }));

// ─── Bulk actions (registered before /:id routes) ───────────
router.post(
  '/bulk/delete',
  requireWriter,
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids[] required' });
    const r = await Lead.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: r.deletedCount });
  })
);

// Bulk move (Kanban multi-select). Invalid transitions are reported, not forced.
router.post(
  '/bulk/status',
  requireWriter,
  asyncHandler(async (req, res) => {
    const { ids = [], status, reason } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || !status) return res.status(400).json({ error: 'ids[] and status are required' });
    if (status === 'Outreach Sent') return res.status(409).json({ error: 'Outreach must be sent individually' });
    const leads = await Lead.find({ _id: { $in: ids.slice(0, 200) } });
    const results = [];
    for (const lead of leads) {
      try {
        transition(lead, status, { actor: req.actor, reason: cleanString(reason, 500) });
        await lead.save();
        results.push({ id: lead.id, ok: true });
      } catch (err) {
        results.push({ id: lead.id, ok: false, error: err.message });
      }
    }
    res.json({ updated: results.filter((r) => r.ok).length, results });
  })
);

router.get('/:id', validateObjectId(), loadLead, (req, res) => res.json(req.lead));

// ─── Edit ────────────────────────────────────────────────────
router.patch(
  '/:id',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    const merged = { ...lead.toObject(), ...req.body };
    const { data, errors } = normalizeLead(merged, { defaultSource: lead.source });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const changed = [];
    for (const k of EDITABLE) {
      if (!(k in req.body)) continue;
      const nv = data[k];
      if (String(lead[k] ?? '') !== String(nv ?? '')) {
        changed.push(k);
        lead[k] = nv;
      }
    }
    if ('tags' in req.body && Array.isArray(req.body.tags)) {
      lead.tags = req.body.tags.map((t) => cleanString(t, 40)).filter(Boolean).slice(0, 20);
      changed.push('tags');
    }
    if ('assigned_to' in req.body) { lead.assigned_to = cleanString(req.body.assigned_to, 120); changed.push('assigned_to'); }
    if ('approved_offer' in req.body) {
      const v = req.body.approved_offer === null || req.body.approved_offer === '' ? undefined : parseMoney(req.body.approved_offer);
      lead.approved_offer = v;
      changed.push('approved_offer');
    }
    if ('estimated_offer_min' in req.body || 'estimated_offer_max' in req.body) {
      const min = parseMoney(req.body.estimated_offer_min ?? lead.estimated_offer_min);
      const max = parseMoney(req.body.estimated_offer_max ?? lead.estimated_offer_max);
      if (min && max && min > max) return res.status(400).json({ error: 'Offer minimum cannot exceed maximum' });
      lead.estimated_offer_min = min;
      lead.estimated_offer_max = max;
      changed.push('offer_range');
    }

    if (changed.length) lead.timeline.push({ type: 'edit', actor: req.actor, message: `Updated ${changed.join(', ')}` });

    const needsRescore = req.body.reunderwrite === true || (req.body.reunderwrite !== false && changed.some((c) => UNDERWRITING_INPUTS.includes(c)) && ['Inbound', 'Underwritten'].includes(lead.status));
    if (needsRescore) {
      if (lead.status === 'Underwritten') transition(lead, 'Inbound', { actor: req.actor, reason: 'Re-underwriting after edit' });
      if (changed.includes('property_address')) lead.geocode_status = 'pending';
      await processLead(lead, { actor: req.actor });
    }
    await lead.save();
    res.json(lead);
  })
);

router.delete(
  '/:id',
  validateObjectId(),
  requireWriter,
  asyncHandler(async (req, res) => {
    const r = await Lead.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: 'Lead not found' });
    res.json({ ok: true, id: req.params.id });
  })
);


// ─── Re-run underwriting ─────────────────────────────────────
router.post(
  '/:id/underwrite',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    const previous = lead.status;
    if (!['Inbound', 'Underwritten', 'Offer Drafted', 'Dead'].includes(previous)) {
      return res.status(409).json({ error: `Cannot re-underwrite a lead in "${previous}". Move it back to Offer Drafted first.` });
    }
    // Reset to Inbound (legal path from each of these states) so the state machine re-evaluates the score.
    if (previous === 'Offer Drafted') transition(lead, 'Underwritten', { actor: req.actor, reason: 'Re-underwriting requested' });
    if (lead.status !== 'Inbound') transition(lead, 'Inbound', { actor: req.actor, reason: 'Re-underwriting requested' });
    lead.geocode_status = 'pending';
    await processLead(lead, { actor: req.actor });
    await lead.save();
    res.json(lead);
  })
);

// ─── State machine transitions ───────────────────────────────
router.post(
  '/:id/status',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const { status, reason, override } = req.body || {};
    const isOverride = Boolean(override);
    if (isOverride && req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can force a manual override' });
    if (status === 'Outreach Sent' && !isOverride) {
      return res.status(409).json({ error: 'Use "Approve & send" to move a lead to Outreach Sent — it dispatches the seller email.' });
    }
    transition(req.lead, status, { actor: req.actor, reason: cleanString(reason, 500), override: isOverride });
    await req.lead.save();
    res.json(req.lead);
  })
);


// ─── Approval + outreach ─────────────────────────────────────
router.post(
  '/:id/submit-for-approval',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    if (!lead.estimated_offer_max && !lead.approved_offer) return res.status(422).json({ error: 'Lead has no offer amount yet' });
    transition(lead, 'Awaiting Approval', { actor: req.actor, reason: cleanString(req.body?.note, 500) || 'Submitted for investor approval' });
    await lead.save();
    res.json(lead);
  })
);

router.post(
  '/:id/approve',
  validateObjectId(),
  requireApprover,
  loadLead,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    if (lead.status !== 'Awaiting Approval') return res.status(409).json({ error: `Lead must be in "Awaiting Approval" (currently "${lead.status}")` });
    const offer = parseMoney(req.body?.offer) ?? lead.approved_offer ?? lead.estimated_offer_max;
    if (!offer) return res.status(422).json({ error: 'An offer amount is required' });
    if (!lead.seller_email) return res.status(422).json({ error: 'Add a seller email address before sending the offer' });
    lead.approved_offer = offer;
    const result = await sendOutreach(lead, {
      kind: 'cash_offer',
      offer,
      note: cleanString(req.body?.note, 1000),
      subject: cleanString(req.body?.subject, 200),
      body: cleanString(req.body?.body, 8000),
      actor: req.actor,
      base: baseUrl(req),
    });
    // A new offer opens a new round of seller responses.
    lead.seller_response = { status: 'pending', offer_amount: offer };
    transition(lead, 'Outreach Sent', { actor: req.actor, reason: `Offer of $${offer.toLocaleString('en-US')} approved and sent` });
    await lead.save();
    res.json({ lead, delivery: result });
  })
);

// Investor decision on a pending offer: send back for rework, or reject the deal.
router.post(
  '/:id/decision',
  validateObjectId(),
  requireApprover,
  loadLead,
  asyncHandler(async (req, res) => {
    const lead = req.lead;
    const { decision } = req.body || {};
    const reason = cleanString(req.body?.reason, 500);
    if (lead.status !== 'Awaiting Approval') return res.status(409).json({ error: `Lead must be in "Awaiting Approval" (currently "${lead.status}")` });
    if (!['send_back', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be "send_back" or "reject"' });
    if (!reason) return res.status(400).json({ error: 'Please give a reason so the team knows what to change' });
    const to = decision === 'send_back' ? 'Offer Drafted' : 'Dead';
    lead.timeline.push({ type: 'decision', actor: req.actor, message: `${decision === 'send_back' ? 'Sent back for rework' : 'Rejected'}: ${reason}` });
    transition(lead, to, { actor: req.actor, reason: `${decision === 'send_back' ? 'Investor sent back' : 'Investor rejected'}: ${reason}` });
    await lead.save();
    res.json(lead);
  })
);

// Private seller portal link for this lead (created on first request).
router.get(
  '/:id/portal-link',
  validateObjectId(),
  requireApprover,
  loadLead,
  asyncHandler(async (req, res) => {
    const token = await ensurePortalToken(req.lead);
    if (req.lead.isModified()) await req.lead.save();
    res.json({ url: portalUrl(baseUrl(req), token), path: `/offer/${token}` });
  })
);

// Clarification or follow-up emails — do not change the pipeline stage.
router.post(
  '/:id/outreach',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const kind = ['clarification', 'follow_up'].includes(req.body?.kind) ? req.body.kind : 'clarification';
    const result = await sendOutreach(req.lead, {
      kind,
      note: cleanString(req.body?.note, 1000),
      subject: cleanString(req.body?.subject, 200),
      body: cleanString(req.body?.body, 8000),
      actor: req.actor,
      base: baseUrl(req),
    });
    await req.lead.save();
    res.json({ lead: req.lead, delivery: result });
  })
);

router.get('/:id/email-preview', validateObjectId(), loadLead, (req, res) => {
  const kind = ['cash_offer', 'clarification', 'follow_up'].includes(req.query.kind) ? req.query.kind : 'cash_offer';
  const offer = parseMoney(req.query.offer);
  res.json({ kind, to: req.lead.seller_email || null, ...buildSellerEmail(req.lead, kind, { offer, note: cleanString(req.query.note, 1000), portalUrl: `${baseUrl(req)}/offer/…` }) });
});

// ─── Notes ───────────────────────────────────────────────────
router.post(
  '/:id/notes',
  validateObjectId(),
  requireWriter,
  loadLead,
  asyncHandler(async (req, res) => {
    const message = cleanString(req.body?.message, 2000);
    if (!message) return res.status(400).json({ error: 'Note text is required' });
    req.lead.timeline.push({ type: 'note', actor: req.actor, message });
    await req.lead.save();
    res.status(201).json(req.lead);
  })
);

export default router;
