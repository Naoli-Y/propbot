import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { requireCronOrUser, requireUser } from '../middleware/auth.js';
import { JobRun } from '../models/JobRun.js';
import { runJob, pipelineAudit, dailyDigest, processPendingLeads } from '../services/jobs.js';

// Endpoints for GCP Cloud Scheduler (HTTP target, header x-cron-secret) and manual runs from the dashboard.
const router = Router();

const JOBS = {
  audit: { name: 'pipeline-audit', fn: pipelineAudit, label: 'Pipeline audit — flag stale hot leads' },
  digest: { name: 'daily-digest', fn: dailyDigest, label: 'Daily summary digest email' },
  'process-pending': { name: 'process-pending', fn: () => processPendingLeads({ limit: 25 }), label: 'Underwrite leads stuck in Inbound' },
};

router.get('/', requireUser, (_req, res) => res.json({ jobs: Object.entries(JOBS).map(([key, j]) => ({ key, name: j.name, label: j.label })) }));

router.get(
  '/runs',
  requireUser,
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    res.json({ runs: await JobRun.find().sort({ started_at: -1 }).limit(limit) });
  })
);

router.post(
  '/:job',
  requireCronOrUser,
  asyncHandler(async (req, res) => {
    const job = JOBS[req.params.job];
    if (!job) return res.status(404).json({ error: `Unknown job "${req.params.job}"` });
    const run = await runJob(job.name, job.fn, { trigger: req.trigger, triggeredBy: req.actor });
    res.json({ run });
  })
);

export default router;
