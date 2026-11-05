import { env } from '../config/env.js';
import { fetchJson, withRetry } from '../utils/retry.js';
import { computeOfferRange } from './heuristics.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Structured output schema — Gemini is forced to return exactly this JSON shape.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    viability_score: { type: 'INTEGER', description: 'Deal viability 0-100' },
    estimated_market_value: { type: 'NUMBER', description: 'As-is market value in USD' },
    after_repair_value: { type: 'NUMBER', description: 'After-repair value (ARV) in USD' },
    estimated_repair_cost: { type: 'NUMBER', description: 'Total estimated repair cost in USD' },
    estimated_offer_min: { type: 'NUMBER' },
    estimated_offer_max: { type: 'NUMBER' },
    defects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          item: { type: 'STRING' },
          severity: { type: 'STRING', enum: ['low', 'medium', 'high', 'critical'] },
          estimated_repair_cost: { type: 'NUMBER' },
        },
        required: ['item', 'severity'],
      },
    },
    ai_reasoning: { type: 'STRING', description: 'Step-by-step underwriting rationale, 4-8 short lines' },
    ai_confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: ['viability_score', 'estimated_market_value', 'estimated_offer_min', 'estimated_offer_max', 'defects', 'ai_reasoning', 'ai_confidence'],
};

const SYSTEM_PROMPT = `You are an expert residential real estate acquisitions underwriter for a cash home-buying firm.
Evaluate inbound seller leads quickly and conservatively.

Method:
1. Extract concrete property defects from the seller's condition notes (roof, foundation, HVAC, plumbing, electrical, mold, fire, pests, kitchen/bath, cosmetic). Estimate a repair cost for each.
2. Estimate the as-is market value and after-repair value (ARV) using the address, neighborhood context, property facts and general US market knowledge. If information is thin, be conservative and lower your confidence.
3. Compute the maximum allowable offer (MAO) = ARV × 0.70 − total repairs. Offer range = [MAO × 0.90, MAO], never above the asking price.
4. Viability score 0–100: equity spread between asking price and market value (~60 pts), whether asking fits under MAO (~20 pts), seller motivation/timeline (~15 pts), data completeness (~5 pts).
5. Write ai_reasoning as short numbered lines a human investor can audit: defects, values, MAO math, score drivers, and what to ask the seller next.

All money values are plain USD numbers (no symbols). Never invent facts the seller did not state; flag missing information instead.`;

function buildPrompt(lead, geo) {
  const facts = {
    address: lead.property_address,
    asking_price: lead.asking_price ?? 'not provided',
    property_condition_notes: lead.property_condition || 'not provided',
    seller_timeline: lead.seller_timeline || 'not provided',
    property_type: lead.property_type,
    bedrooms: lead.bedrooms,
    bathrooms: lead.bathrooms,
    square_feet: lead.square_feet,
    year_built: lead.year_built,
    neighborhood: geo?.status === 'ok' ? geo.neighborhood : undefined,
  };
  return `Underwrite this lead and respond with JSON only.\n\n${JSON.stringify(facts, null, 2)}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Validates/normalises the model output so downstream code can trust it. */
function sanitize(raw, lead) {
  const defects = Array.isArray(raw.defects)
    ? raw.defects.slice(0, 20).map((d) => ({
        item: String(d.item || 'Unspecified issue').slice(0, 120),
        severity: ['low', 'medium', 'high', 'critical'].includes(d.severity) ? d.severity : 'medium',
        estimated_repair_cost: num(d.estimated_repair_cost) ?? undefined,
      }))
    : [];
  const repairs = num(raw.estimated_repair_cost) ?? defects.reduce((s, d) => s + (d.estimated_repair_cost || 0), 0);
  const marketValue = num(raw.estimated_market_value);
  const arv = num(raw.after_repair_value) ?? (marketValue ? marketValue + repairs : null);

  let min = num(raw.estimated_offer_min);
  let max = num(raw.estimated_offer_max);
  if (min && max && min > max) [min, max] = [max, min];
  // If the model's range is missing or wildly off the MAO formula, fall back to the formula.
  const formula = computeOfferRange({ arv, repairs, asking: lead.asking_price });
  if (!max || (formula.max && (max > formula.max * 1.25 || max < formula.max * 0.6))) {
    min = formula.min;
    max = formula.max;
  }
  if (lead.asking_price && max > lead.asking_price) max = lead.asking_price;
  if (min && max && min > max) min = Math.round(max * 0.9);

  return {
    engine: 'gemini',
    viability_score: Math.max(0, Math.min(100, Math.round(Number(raw.viability_score) || 0))),
    estimated_market_value: marketValue,
    after_repair_value: arv,
    estimated_repair_cost: repairs,
    estimated_offer_min: min,
    estimated_offer_max: max,
    defects,
    ai_reasoning: String(raw.ai_reasoning || '').slice(0, 6000),
    ai_confidence: ['low', 'medium', 'high'].includes(raw.ai_confidence) ? raw.ai_confidence : 'medium',
  };
}

export const geminiEnabled = () => Boolean(env.gemini.apiKey);

export async function underwriteWithGemini(lead, geo, { deadline } = {}) {
  if (!geminiEnabled()) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'NO_KEY';
    throw err;
  }
  const url = `${ENDPOINT}/${encodeURIComponent(env.gemini.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt(lead, geo) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
      // Disable "thinking" on 2.5 Flash to keep latency inside the 3s budget.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const data = await withRetry(
    () =>
      fetchJson(url, {
        method: 'POST',
        timeoutMs: env.gemini.timeoutMs,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.gemini.apiKey },
        body: JSON.stringify(body),
      }),
    { retries: 2, baseMs: 400, maxMs: 3000, label: 'Gemini underwrite', deadline }
  );

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'empty response';
    throw new Error(`Gemini returned no content (${reason})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }
  return { ...sanitize(parsed, lead), usage: data.usageMetadata };
}
