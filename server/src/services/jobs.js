import { env } from '../config/env.js';
import { Lead } from '../models/Lead.js';
import { JobRun } from '../models/JobRun.js';
import { logger } from '../utils/logger.js';
import { processLead } from './pipeline.js';
import { sendEmail, sendgridEnabled } from './email.js';
import { PIPELINE_STAGES } from './stateMachine.js';

const money = (n) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

/** Wraps a job with a persisted JobRun record. */
export async function runJob(name, fn, { trigger = 'manual', triggeredBy } = {}) {
  const run = await JobRun.create({ job: name, trigger, triggered_by: triggeredBy });
  const started = Date.now();
  try {
    const result = await fn();
    Object.assign(run, { status: 'success', result, finished_at: new Date(), duration_ms: Date.now() - started });
    await run.save();
    logger.info(`Job ${name} finished`, { durationMs: run.duration_ms, result });
    return run;
  } catch (err) {
    Object.assign(run, { status: 'failed', error: err.message, finished_at: new Date(), duration_ms: Date.now() - started });
    await run.save();
    logger.error(`Job ${name} failed`, { error: err });
    throw err;
  }
}

/**
 * Pipeline audit: flags hot leads that have sat untouched in an action stage
 * (Offer Drafted / Awaiting Approval) longer than STALE_LEAD_HOURS, and un-flags
 * leads that have since moved.
 */
export async function pipelineAudit() {
  const cutoff = new Date(Date.now() - env.rules.staleLeadHours * 3600 * 1000);
  const staleQuery = {
    status: { $in: ['Offer Drafted', 'Awaiting Approval'] },
    viability_score: { $gte: env.rules.viabilityThreshold },
    status_changed_at: { $lt: cutoff },
    is_stale: false,
  };
  const toFlag = await Lead.find(staleQuery);
  for (const lead of toFlag) {
    lead.is_stale = true;
    const hours = Math.round((Date.now() - lead.status_changed_at.getTime()) / 3600000);
    lead.timeline.push({ type: 'stale_flag', actor: 'pipeline-audit', message: `Hot lead idle in "${lead.status}" for ${hours}h — needs attention` });
    await lead.save();
  }

  const unflag = await Lead.updateMany(
    { is_stale: true, $or: [{ status: { $nin: ['Offer Drafted', 'Awaiting Approval'] } }, { status_changed_at: { $gte: cutoff } }] },
    { $set: { is_stale: false } }
  );

  const followUpCutoff = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const followUpDue = await Lead.countDocuments({ status: 'Outreach Sent', status_changed_at: { $lt: followUpCutoff } });

  return { flagged: toFlag.length, unflagged: unflag.modifiedCount, totalStale: await Lead.countDocuments({ is_stale: true }), followUpDue };
}

/** Retries any leads stuck in Inbound (e.g. background CSV imports interrupted by a container shutdown). */
export async function processPendingLeads({ limit = 25 } = {}) {
  const pending = await Lead.find({ status: 'Inbound', underwriting_status: { $ne: 'ok' } }).sort({ created_at: 1 }).limit(limit);
  let processed = 0;
  let failed = 0;
  for (const lead of pending) {
    try {
      await processLead(lead, { actor: 'pipeline-sweep' });
      await lead.save();
      processed++;
    } catch (err) {
      failed++;
      logger.error('Failed to process pending lead', { leadId: String(lead._id), error: err });
    }
  }
  return { found: pending.length, processed, failed };
}

export async function buildDigest() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [byStatus, newLeads, hot, stale, sent] = await Promise.all([
    Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.countDocuments({ created_at: { $gte: since } }),
    Lead.find({ status: { $in: ['Offer Drafted', 'Awaiting Approval'] }, viability_score: { $gte: env.rules.viabilityThreshold } })
      .sort({ viability_score: -1 }).limit(10).lean(),
    Lead.find({ is_stale: true }).sort({ status_changed_at: 1 }).limit(10).lean(),
    Lead.countDocuments({ 'outreach.sent_at': { $gte: since } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return { since, newLeads, outreachLast24h: sent, counts, hot, stale };
}

export function renderDigest(d) {
  const row = (l) => `${l.viability_score ?? '—'}/100  ${l.property_address}  (${l.status}, offer ${money(l.estimated_offer_min)}–${money(l.estimated_offer_max)})`;
  const text = [
    `PropBot daily pipeline digest — ${new Date().toDateString()}`,
    '',
    `New leads (24h): ${d.newLeads}`,
    `Outreach emails (24h): ${d.outreachLast24h}`,
    '',
    'Pipeline:',
    ...PIPELINE_STAGES.map((s) => `  ${s}: ${d.counts[s] || 0}`),
    `  Dead: ${d.counts.Dead || 0}`,
    '',
    `Hot leads awaiting action (${d.hot.length}):`,
    ...(d.hot.length ? d.hot.map((l) => `  • ${row(l)}`) : ['  none']),
    '',
    `Stale hot leads (${d.stale.length}):`,
    ...(d.stale.length ? d.stale.map((l) => `  • ${row(l)}`) : ['  none']),
  ].join('\n');

  const li = (l) => `<tr><td style="padding:6px 8px;font-weight:600">${l.viability_score ?? '—'}</td><td style="padding:6px 8px">${l.property_address}</td><td style="padding:6px 8px">${l.status}</td><td style="padding:6px 8px">${money(l.estimated_offer_min)}–${money(l.estimated_offer_max)}</td></tr>`;
  const table = (rows) => (rows.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px">${rows.map(li).join('')}</table>` : '<p style="color:#6b7680">None</p>');
  const html = `<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;max-width:640px">
<h2 style="color:#0f3d3e">PropBot daily digest</h2>
<p><strong>${d.newLeads}</strong> new leads and <strong>${d.outreachLast24h}</strong> outreach emails in the last 24 hours.</p>
<p>${PIPELINE_STAGES.map((s) => `${s}: <strong>${d.counts[s] || 0}</strong>`).join(' · ')}</p>
<h3>Hot leads awaiting action</h3>${table(d.hot)}
<h3>Stale hot leads</h3>${table(d.stale)}</div>`;
  return { subject: `PropBot digest: ${d.hot.length} hot, ${d.stale.length} stale, ${d.newLeads} new`, text, html };
}

export async function dailyDigest() {
  const digest = await buildDigest();
  const email = renderDigest(digest);
  const recipients = env.sendgrid.digestRecipients;
  let delivery = { status: 'skipped', reason: 'DIGEST_RECIPIENTS not set' };
  if (recipients.length) {
    delivery = await sendEmail({ to: recipients, ...email, categories: ['digest'] });
    if (!sendgridEnabled()) delivery.reason = 'SendGrid not configured';
  }
  return {
    newLeads: digest.newLeads,
    hot: digest.hot.length,
    stale: digest.stale.length,
    counts: digest.counts,
    delivery,
    preview: email.text,
  };
}
