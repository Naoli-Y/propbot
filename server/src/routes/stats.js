import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireUser } from '../middleware/auth.js';
import { STATUSES } from '../services/stateMachine.js';

const router = Router();
router.use(requireUser);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    since.setHours(0, 0, 0, 0);

    const [byStatus, totals, daily, scoreBuckets, engines, sources, recentHot, stale] = await Promise.all([
      Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: { $ifNull: ['$estimated_offer_max', 0] } } } }]),
      Lead.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgScore: { $avg: '$viability_score' },
            avgProcessingMs: { $avg: '$processing_ms' },
            under3s: { $sum: { $cond: [{ $lte: ['$processing_ms', 3000] }, 1, 0] } },
            processed: { $sum: { $cond: [{ $eq: ['$underwriting_status', 'ok'] }, 1, 0] } },
            withTiming: { $sum: { $cond: [{ $gt: ['$processing_ms', 0] }, 1, 0] } },
            automated: { $sum: { $cond: [{ $and: [{ $eq: ['$underwriting_status', 'ok'] }, { $ne: ['$source', 'manual'] }] }, 1, 0] } },
            nonManual: { $sum: { $cond: [{ $ne: ['$source', 'manual'] }, 1, 0] } },
            hot: { $sum: { $cond: [{ $gte: ['$viability_score', env.rules.viabilityThreshold] }, 1, 0] } },
            stale: { $sum: { $cond: ['$is_stale', 1, 0] } },
            offersSent: { $sum: { $cond: [{ $eq: ['$status', 'Outreach Sent'] }, 1, 0] } },
            pipelineValue: { $sum: { $cond: [{ $in: ['$status', ['Offer Drafted', 'Awaiting Approval', 'Outreach Sent']] }, { $ifNull: ['$approved_offer', { $ifNull: ['$estimated_offer_max', 0] }] }, 0] } },
          },
        },
      ]),
      Lead.aggregate([
        { $match: { created_at: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }, count: { $sum: 1 }, hot: { $sum: { $cond: [{ $gte: ['$viability_score', env.rules.viabilityThreshold] }, 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
      Lead.aggregate([
        { $match: { viability_score: { $type: 'number' } } },
        { $bucket: { groupBy: '$viability_score', boundaries: [0, 20, 40, 60, 70, 80, 101], default: 'other', output: { count: { $sum: 1 } } } },
      ]),
      Lead.aggregate([{ $group: { _id: '$underwriting_engine', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      Lead.find({ viability_score: { $gte: env.rules.viabilityThreshold }, status: { $in: ['Offer Drafted', 'Awaiting Approval'] } }, '-timeline -outreach -ai_reasoning')
        .sort({ viability_score: -1 }).limit(6),
      Lead.find({ is_stale: true }, '-timeline -outreach -ai_reasoning').sort({ status_changed_at: 1 }).limit(6),
    ]);

    // Fill gaps in the daily series so the chart has continuous dates.
    const map = Object.fromEntries(daily.map((d) => [d._id, d]));
    const series = [];
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: map[key]?.count || 0, hot: map[key]?.hot || 0 });
    }

    const t = totals[0] || {};
    const labels = { 0: '0–19', 20: '20–39', 40: '40–59', 60: '60–69', 70: '70–79', 80: '80–100' };
    res.json({
      threshold: env.rules.viabilityThreshold,
      totals: {
        total: t.total || 0,
        avgScore: t.avgScore ? Math.round(t.avgScore) : null,
        avgProcessingMs: t.avgProcessingMs ? Math.round(t.avgProcessingMs) : null,
        under3sRate: t.withTiming ? Math.round((t.under3s / t.withTiming) * 100) : null,
        automationRate: t.nonManual ? Math.round((t.automated / t.nonManual) * 100) : t.total ? Math.round((t.processed / t.total) * 100) : null,
        hot: t.hot || 0,
        stale: t.stale || 0,
        offersSent: t.offersSent || 0,
        pipelineValue: t.pipelineValue || 0,
      },
      byStatus: STATUSES.map((s) => {
        const hit = byStatus.find((b) => b._id === s);
        return { status: s, count: hit?.count || 0, value: hit?.value || 0 };
      }),
      daily: series,
      scoreBuckets: Object.entries(labels).map(([k, label]) => ({ label, count: scoreBuckets.find((b) => String(b._id) === k)?.count || 0 })),
      engines: engines.filter((e) => e._id).map((e) => ({ engine: e._id, count: e.count })),
      sources: sources.map((s) => ({ source: s._id || 'unknown', count: s.count })),
      recentHot,
      stale,
    });
  })
);

export default router;
