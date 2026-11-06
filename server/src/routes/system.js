import { Router } from 'express';
import { env } from '../config/env.js';
import { dbState } from '../config/db.js';
import { requireUser, requirePermission } from '../middleware/auth.js';
import { geminiEnabled } from '../services/gemini.js';
import { sendgridEnabled } from '../services/email.js';
import { geocoderInfo } from '../services/geocoder.js';
import { queueStatus } from '../services/queue.js';

const router = Router();

// Public liveness/readiness probe (Cloud Run health checks).
router.get('/health', (_req, res) => {
  const db = dbState();
  res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
});

const mask = (s) => (s ? `${s.slice(0, 3)}…${s.slice(-2)}` : null);

router.get('/system/status', requireUser, requirePermission('settings.view'), (req, res) => {
  const isAdmin = req.can('settings.secrets');
  res.json({
    environment: env.nodeEnv,
    database: { state: dbState() },
    integrations: {
      gemini: { enabled: geminiEnabled(), model: env.gemini.model, fallback: 'Rules-based heuristic engine' },
      nominatim: { enabled: true, ...geocoderInfo() },
      sendgrid: { enabled: sendgridEnabled(), from: env.sendgrid.fromEmail || null, digestRecipients: env.sendgrid.digestRecipients.length, mode: sendgridEnabled() ? 'live' : 'simulated' },
    },
    rules: env.rules,
    publicSite: { company: env.companyName, url: env.publicAppUrl || null, sellPath: '/sell', portalPath: '/offer' },
    queue: queueStatus(),
    webhook: {
      endpoint: '/api/leads',
      header: 'x-api-key',
      key: isAdmin ? env.webhookApiKey || null : mask(env.webhookApiKey),
    },
    scheduler: { header: 'x-cron-secret', configured: Boolean(env.cronSecret), endpoints: ['/api/jobs/audit', '/api/jobs/digest', '/api/jobs/process-pending'] },
  });
});

export default router;
