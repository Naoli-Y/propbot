import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFound } from './middleware/errors.js';
import leadsRouter from './routes/leads.js';
import authRouter from './routes/auth.js';
import statsRouter from './routes/stats.js';
import jobsRouter from './routes/jobs.js';
import systemRouter from './routes/system.js';
import publicRouter from './routes/public.js';
import rolesRouter from './routes/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Cloud Run sits behind Google's front end
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
          'frame-src': ['https://www.openstreetmap.org'],
          'connect-src': ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS: same-origin in production (SPA served by this app); explicit origins otherwise.
  // Browsers send an Origin header even on same-origin POSTs, so the app's own host is always allowed.
  app.use(
    '/api',
    cors((req, cb) => {
      const origin = req.header('Origin');
      const self = `${req.protocol}://${req.get('host')}`;
      const allowed = !origin || origin === self || env.corsOrigins.length === 0 || env.corsOrigins.includes(origin);
      if (!allowed) return cb(Object.assign(new Error('Origin not allowed by CORS'), { status: 403 }));
      cb(null, { origin: true, credentials: false, allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-cron-secret'] });
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Request logging with latency (feeds the < 3 s performance KPI).
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (!req.originalUrl.startsWith('/api')) return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const meta = { method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) };
      if (res.statusCode >= 500) logger.error('request', meta);
      else if (req.originalUrl !== '/api/health') logger.info('request', meta);
    });
    next();
  });

  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Rate limit exceeded' } }));

  app.use('/api', systemRouter);
  app.use('/api', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api', notFound);

  // Serve the built React app (single container deployment on Cloud Run).
  const clientDist = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
    logger.info('Serving dashboard', { clientDist });
  } else {
    app.get('/', (_req, res) => res.json({ name: 'PropBot API', status: 'ok', docs: '/api/health' }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
