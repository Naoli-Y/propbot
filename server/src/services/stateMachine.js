// Lead lifecycle state machine.
// Linear happy path:  Inbound -> Underwritten -> Offer Drafted -> Awaiting Approval -> Outreach Sent
// Branches: any active stage can be marked "Dead" (lost/disqualified); Dead can be revived to Inbound.
// Underwritten can go back to Inbound for re-processing; Awaiting Approval can be sent back to Offer Drafted.

export const STATUSES = ['Inbound', 'Underwritten', 'Offer Drafted', 'Awaiting Approval', 'Outreach Sent', 'Dead'];
export const PIPELINE_STAGES = STATUSES.slice(0, 5);

export const TRANSITIONS = {
  Inbound: ['Underwritten', 'Offer Drafted', 'Dead'],
  Underwritten: ['Offer Drafted', 'Inbound', 'Dead'],
  'Offer Drafted': ['Awaiting Approval', 'Underwritten', 'Dead'],
  'Awaiting Approval': ['Outreach Sent', 'Offer Drafted', 'Dead'],
  'Outreach Sent': ['Awaiting Approval', 'Dead'],
  Dead: ['Inbound'],
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export class TransitionError extends Error {
  constructor(from, to) {
    super(`Invalid status transition: "${from}" → "${to}". Allowed from "${from}": ${(TRANSITIONS[from] || []).join(', ') || 'none'}`);
    this.status = 409;
    this.from = from;
    this.to = to;
  }
}

/**
 * Validates and applies a transition to a lead document and records it in the audit timeline.
 * `override: true` lets an admin force any transition (recorded as a manual override with a reason).
 */
export function transition(lead, to, { actor = 'system', reason, override = false } = {}) {
  const from = lead.status;
  if (!STATUSES.includes(to)) {
    const err = new Error(`Unknown status "${to}"`);
    err.status = 400;
    throw err;
  }
  if (from === to) return lead;
  if (!override && !canTransition(from, to)) throw new TransitionError(from, to);
  if (override && !reason) {
    const err = new Error('A reason is required for manual status overrides');
    err.status = 400;
    throw err;
  }
  lead.status = to;
  lead.status_changed_at = new Date();
  lead.is_stale = false;
  lead.timeline.push({
    type: override ? 'override' : 'status_change',
    actor,
    from,
    to,
    message: reason || `Status changed from ${from} to ${to}`,
  });
  return lead;
}

/** Initial status after underwriting, per the architecture doc (score >= threshold -> Offer Drafted). */
export function statusAfterUnderwriting(score, threshold) {
  return typeof score === 'number' && score >= threshold ? 'Offer Drafted' : 'Underwritten';
}
