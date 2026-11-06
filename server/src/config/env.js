import dotenv from 'dotenv';

dotenv.config();

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 5000),
  corsOrigins: list(process.env.CORS_ORIGINS),
  // Public URL of the app, used in seller emails (e.g. https://propbot-xyz.a.run.app). Falls back to the request origin.
  publicAppUrl: (process.env.PUBLIC_APP_URL || '').replace(/\/$/, ''),
  companyName: process.env.COMPANY_NAME || 'PropBot Home Buyers',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/propbot',

  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@propbot.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminName: process.env.ADMIN_NAME || 'Acquisition Admin',
  webhookApiKey: process.env.WEBHOOK_API_KEY || '',
  cronSecret: process.env.CRON_SECRET || '',

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: int(process.env.GEMINI_TIMEOUT_MS, 8000),
  },

  nominatim: {
    baseUrl: process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',
    userAgent: process.env.NOMINATIM_USER_AGENT || 'PropBot/1.0',
    timeoutMs: int(process.env.NOMINATIM_TIMEOUT_MS, 4000),
  },

  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || '',
    fromName: process.env.SENDGRID_FROM_NAME || 'PropBot Acquisitions',
    digestRecipients: list(process.env.DIGEST_RECIPIENTS),
  },

  rules: {
    viabilityThreshold: int(process.env.VIABILITY_THRESHOLD, 70),
    staleLeadHours: int(process.env.STALE_LEAD_HOURS, 48),
    autoQueueForApproval: bool(process.env.AUTO_QUEUE_FOR_APPROVAL, false),
  },
};

export function assertProductionConfig(logger) {
  if (!env.isProd) return;
  const problems = [];
  if (env.jwtSecret === 'dev-insecure-secret' || env.jwtSecret.startsWith('change-me')) problems.push('JWT_SECRET');
  if (!env.webhookApiKey || env.webhookApiKey.startsWith('change-me')) problems.push('WEBHOOK_API_KEY');
  if (!env.cronSecret || env.cronSecret.startsWith('change-me')) problems.push('CRON_SECRET');
  if (problems.length) {
    logger.warn('Insecure production configuration — set these env vars', { vars: problems });
  }
}
