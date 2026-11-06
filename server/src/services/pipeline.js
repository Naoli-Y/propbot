import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { geocodeAddress } from './geocoder.js';
import { underwriteWithGemini, geminiEnabled } from './gemini.js';
import { heuristicUnderwrite } from './heuristics.js';
import { transition, statusAfterUnderwriting } from './stateMachine.js';
import { buildSellerEmail, sendEmail } from './email.js';
import { ensurePortalToken, portalUrl } from './portal.js';

// Overall time budget for ingestion → score (PRD: < 3 s). External calls past the
// budget stop retrying; the deterministic engine fills any gap.
const BUDGET_MS = 2800;

/**
 * Runs geocoding and AI underwriting concurrently, applies results to the lead,
 * assigns the initial pipeline status and records everything in the audit timeline.
 * Never throws for third-party failures — the lead is always saved in a usable state.
 */
export async function processLead(lead, { actor = 'system' } = {}) {
  const started = Date.now();
  const deadline = started + BUDGET_MS;

  const geoPromise = geocodeAddress(lead.property_address, { deadline }).catch((err) => ({ status: 'failed', error: err }));

  // Gemini runs concurrently with geocoding. It gets the raw address; neighbourhood context is added
  // if geocoding resolves quickly (within 900 ms), otherwise we don't wait for it.
  const aiPromise = (async () => {
    if (!geminiEnabled()) return { fallbackReason: 'Gemini API key not configured' };
    const quickGeo = await Promise.race([geoPromise, new Promise((r) => setTimeout(() => r(null), 900))]);
    try {
      return await underwriteWithGemini(lead, quickGeo, { deadline: started + env.gemini.timeoutMs });
    } catch (err) {
      logger.warn('Gemini underwriting failed — using heuristic engine', { leadId: String(lead._id), error: err.message, status: err.status });
      return { fallbackReason: err.status === 429 ? 'Gemini rate limit reached' : `Gemini error: ${err.message}` };
    }
  })();

  const [geo, aiResult] = await Promise.all([geoPromise, aiPromise]);

  // ── Geocoding results
  if (geo.status === 'ok') {
    Object.assign(lead, {
      latitude: geo.latitude,
      longitude: geo.longitude,
      formatted_address: geo.formatted_address,
      neighborhood: geo.neighborhood,
      geocode_status: 'ok',
    });
    lead.timeline.push({ type: 'geocoded', actor: 'nominatim', message: `Resolved to ${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`, meta: { cached: Boolean(geo.cached) } });
  } else if (geo.status === 'not_found') {
    lead.geocode_status = 'not_found';
    lead.timeline.push({ type: 'error', actor: 'nominatim', message: 'Address could not be located — verify the street address' });
  } else {
    lead.geocode_status = 'failed';
    lead.timeline.push({ type: 'error', actor: 'nominatim', message: `Geocoding failed: ${geo.error?.message || 'unknown error'}` });
  }

  // ── Underwriting results
  let uw = aiResult;
  if (!uw || uw.fallbackReason) {
    uw = heuristicUnderwrite(lead);
    uw.ai_reasoning = `${uw.ai_reasoning}\n(Fallback reason: ${aiResult?.fallbackReason || 'unknown'})`;
  }

  Object.assign(lead, {
    viability_score: uw.viability_score,
    estimated_market_value: uw.estimated_market_value ?? undefined,
    after_repair_value: uw.after_repair_value ?? undefined,
    estimated_repair_cost: uw.estimated_repair_cost ?? undefined,
    estimated_offer_min: uw.estimated_offer_min ?? undefined,
    estimated_offer_max: uw.estimated_offer_max ?? undefined,
    defects: uw.defects,
    ai_reasoning: uw.ai_reasoning,
    ai_confidence: uw.ai_confidence,
    underwriting_engine: uw.engine,
    underwriting_status: 'ok',
    underwritten_at: new Date(),
  });
  lead.processing_ms = Date.now() - started;
  lead.timeline.push({
    type: 'underwritten',
    actor: uw.engine === 'gemini' ? `gemini:${env.gemini.model}` : 'heuristic-engine',
    message: `Viability ${uw.viability_score}/100 · offer ${uw.estimated_offer_min ?? '—'}–${uw.estimated_offer_max ?? '—'}`,
    meta: { engine: uw.engine, processing_ms: lead.processing_ms, tokens: uw.usage?.totalTokenCount },
  });

  // ── State machine
  const next = statusAfterUnderwriting(uw.viability_score, env.rules.viabilityThreshold);
  if (lead.status === 'Inbound') {
    if (next === 'Offer Drafted') {
      transition(lead, 'Underwritten', { actor, reason: 'AI underwriting complete' });
      transition(lead, 'Offer Drafted', { actor, reason: `Score ${uw.viability_score} ≥ threshold ${env.rules.viabilityThreshold} — initial cash offer drafted` });
      if (env.rules.autoQueueForApproval) transition(lead, 'Awaiting Approval', { actor, reason: 'Auto-queued for investor approval' });
    } else {
      transition(lead, 'Underwritten', { actor, reason: `Score ${uw.viability_score} below threshold ${env.rules.viabilityThreshold}` });
    }
  }

  return lead;
}

/** Sends a seller email for a lead and records it in outreach + timeline. */
export async function sendOutreach(lead, { kind = 'cash_offer', offer, note, subject, body, actor = 'system', base } = {}) {
  if (!lead.seller_email) {
    const err = new Error('This lead has no seller email address');
    err.status = 422;
    throw err;
  }
  const token = await ensurePortalToken(lead);
  const link = base ? portalUrl(base, token) : undefined;
  const tpl = buildSellerEmail(lead, kind, { offer, note, portalUrl: link });
  const finalSubject = subject || tpl.subject;
  const text = body ? (link ? `${body}\n\nView and respond online: ${link}` : body) : tpl.text;
  const html = body ? undefined : tpl.html;

  let result;
  try {
    result = await sendEmail({ to: lead.seller_email, subject: finalSubject, text, html, categories: [kind] });
  } catch (err) {
    lead.outreach.push({ kind, to: lead.seller_email, subject: finalSubject, body: text, status: 'failed', error: err.message, sent_by: actor });
    lead.timeline.push({ type: 'error', actor: 'sendgrid', message: `Email failed: ${err.message}` });
    await lead.save();
    err.status = err.status && err.status < 500 ? 502 : err.status || 502;
    throw err;
  }

  lead.outreach.push({ kind, to: lead.seller_email, subject: finalSubject, body: text, status: result.status, provider_message_id: result.messageId, sent_by: actor });
  lead.timeline.push({
    type: 'outreach',
    actor,
    message: `${kind.replace('_', ' ')} email ${result.status === 'simulated' ? 'simulated (SendGrid not configured)' : 'sent'} to ${lead.seller_email}`,
    meta: { messageId: result.messageId },
  });
  return result;
}
