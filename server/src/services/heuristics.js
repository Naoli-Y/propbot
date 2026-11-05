// Deterministic underwriting heuristics.
// Used (1) as the fallback engine when Gemini is unavailable/rate-limited, and
// (2) to sanity-check and normalise Gemini's numbers so the output is always internally consistent.

const DEFECT_RULES = [
  { item: 'Roof damage / replacement', re: /\broof\b.*(leak|damage|old|replace|missing|sag)|(leak|damaged|old).*\broof\b/i, severity: 'high', perSqft: 6, min: 8000 },
  { item: 'Foundation issues', re: /foundation|structural|settling|cracked slab|sinking/i, severity: 'critical', perSqft: 9, min: 15000 },
  { item: 'Outdated / failing HVAC', re: /hvac|furnace|\bac\b|a\/c|air condition|heat pump|boiler/i, severity: 'medium', perSqft: 0, min: 7500 },
  { item: 'Plumbing problems', re: /plumbing|pipe|sewer|septic|water heater|leak(?!.*roof)/i, severity: 'medium', perSqft: 2.5, min: 4000 },
  { item: 'Electrical problems', re: /electric|wiring|knob and tube|panel|fuse box|aluminum wiring/i, severity: 'high', perSqft: 3, min: 5000 },
  { item: 'Water / mold damage', re: /mold|mildew|water damage|flood|moisture|damp/i, severity: 'high', perSqft: 4, min: 6000 },
  { item: 'Fire / smoke damage', re: /fire|smoke damage|burn/i, severity: 'critical', perSqft: 25, min: 30000 },
  { item: 'Pest / termite damage', re: /termite|pest|rodent|infest|roach|bed ?bug/i, severity: 'medium', perSqft: 1.5, min: 2500 },
  { item: 'Kitchen renovation needed', re: /kitchen.*(old|outdated|gut|dated|original)|(outdated|dated|old).*kitchen/i, severity: 'medium', perSqft: 0, min: 15000 },
  { item: 'Bathroom renovation needed', re: /bath(room)?.*(old|outdated|gut|dated)|(outdated|dated|old).*bath/i, severity: 'low', perSqft: 0, min: 8000 },
  { item: 'Windows need replacement', re: /window/i, severity: 'low', perSqft: 1.5, min: 4000 },
  { item: 'Flooring replacement', re: /floor|carpet/i, severity: 'low', perSqft: 4, min: 3000 },
  { item: 'Cosmetic updates (paint, fixtures)', re: /paint|cosmetic|dated|outdated|tlc|fixer|handyman/i, severity: 'low', perSqft: 3, min: 3000 },
];

const DISTRESS = /inherit|probate|estate sale|divorce|foreclos|behind on payments|tax lien|relocat|job transfer|tired landlord|bad tenant|vacant|code violation|must sell|as[- ]is|cash only|urgent/i;
const GOOD = /move[- ]in ready|renovated|updated|new roof|turnkey|remodeled|excellent condition|like new/i;

const TIMELINE_POINTS = { ASAP: 15, 'Within 30 days': 12, '1-3 months': 8, '3-6 months': 4, Flexible: 3 };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n, to = 500) => Math.round(n / to) * to;

export function extractDefects(text = '', sqft) {
  const area = sqft && sqft > 200 ? sqft : 1500;
  const t = String(text || '');
  const found = [];
  for (const rule of DEFECT_RULES) {
    if (rule.re.test(t) && !found.some((f) => f.item === rule.item)) {
      found.push({ item: rule.item, severity: rule.severity, estimated_repair_cost: round(Math.max(rule.min, rule.perSqft * area)) });
    }
  }
  // Cosmetic is implied by heavier rehab items; avoid double counting.
  if (found.length > 2) return found.filter((f) => f.item !== 'Cosmetic updates (paint, fixtures)');
  return found;
}

/**
 * Investor math used throughout the app:
 *   MAO (max allowable offer) = ARV × 70% − repairs
 *   Offer range = [MAO × 0.90, MAO]   (never above asking price)
 */
export function computeOfferRange({ arv, repairs, asking }) {
  if (!arv || arv <= 0) return { min: null, max: null };
  let max = arv * 0.7 - (repairs || 0);
  if (asking && asking > 0) max = Math.min(max, asking);
  max = Math.max(0, max);
  return { min: round(max * 0.9, 1000), max: round(max, 1000) };
}

/** Score 0–100: equity spread (60) + offer fit (20) + motivation (15) + data quality (5). */
export function computeViabilityScore({ marketValue, asking, maxOffer, timeline, condition, lead = {} }) {
  let equity = 25;
  if (marketValue && asking) {
    const spread = (marketValue - asking) / marketValue;
    equity = clamp(((spread + 0.05) / 0.35) * 60, 0, 60);
  }
  let fit = 8;
  if (maxOffer && asking) {
    fit = asking <= maxOffer ? 20 : 20 * clamp(1 - ((asking - maxOffer) / asking) * 2.5, 0, 1);
  }
  let motivation = TIMELINE_POINTS[timeline] ?? 5;
  if (DISTRESS.test(`${condition || ''} ${timeline || ''}`)) motivation += 5;
  motivation = clamp(motivation, 0, 15);
  const fields = ['asking_price', 'property_condition', 'seller_timeline', 'square_feet', 'seller_email'];
  const quality = (fields.filter((f) => lead[f] !== undefined && lead[f] !== null && lead[f] !== '').length / fields.length) * 5;
  return Math.round(clamp(equity + fit + motivation + quality, 0, 100));
}

/** Rough market value when no AI estimate exists. Low confidence by design. */
function estimateMarketValue(lead, repairs) {
  const sqft = lead.square_feet;
  const conditionText = lead.property_condition || '';
  if (lead.asking_price) {
    // Distressed / motivated sellers tend to under-ask; turnkey listings tend to be at or above market.
    let factor = 1.08;
    if (DISTRESS.test(conditionText)) factor += 0.07;
    if (GOOD.test(conditionText)) factor -= 0.06;
    // Asking typically already discounts some visible repairs.
    return round(lead.asking_price * factor + repairs * 0.35, 1000);
  }
  if (sqft) return round(sqft * 210, 1000); // ~US median price per sq ft fallback
  return null;
}

export function heuristicUnderwrite(lead) {
  const defects = extractDefects(lead.property_condition, lead.square_feet);
  const repairs = defects.reduce((s, d) => s + (d.estimated_repair_cost || 0), 0);
  const asIsValue = estimateMarketValue(lead, repairs);
  const arv = asIsValue ? round(asIsValue + repairs * 0.85, 1000) : null;
  const { min, max } = computeOfferRange({ arv, repairs, asking: lead.asking_price });
  const score = computeViabilityScore({
    marketValue: asIsValue,
    asking: lead.asking_price,
    maxOffer: max,
    timeline: lead.seller_timeline,
    condition: lead.property_condition,
    lead,
  });

  const lines = [];
  lines.push(`Rules-based underwriting (AI engine unavailable) — treat numbers as a first pass.`);
  lines.push(defects.length
    ? `Detected ${defects.length} condition issue(s): ${defects.map((d) => d.item.toLowerCase()).join(', ')}; estimated repairs ≈ $${repairs.toLocaleString('en-US')}.`
    : 'No major defects detected in the seller notes.');
  if (asIsValue) lines.push(`Estimated as-is market value ≈ $${asIsValue.toLocaleString('en-US')}; after-repair value (ARV) ≈ $${arv.toLocaleString('en-US')}.`);
  if (max) lines.push(`Using the 70% rule (ARV × 0.70 − repairs) the maximum allowable offer is $${max.toLocaleString('en-US')}, giving an offer range of $${min.toLocaleString('en-US')}–$${max.toLocaleString('en-US')}.`);
  if (!lead.asking_price) lines.push('Asking price is missing — request it from the seller before making an offer.');
  if (lead.seller_timeline) lines.push(`Seller timeline: ${lead.seller_timeline}.`);
  lines.push(`Viability score ${score}/100 (equity spread, offer fit, seller motivation, data completeness).`);

  return {
    engine: 'heuristic',
    viability_score: score,
    estimated_market_value: asIsValue,
    estimated_repair_cost: repairs,
    after_repair_value: arv,
    estimated_offer_min: min,
    estimated_offer_max: max,
    defects,
    ai_reasoning: lines.join('\n'),
    ai_confidence: 'low',
  };
}
