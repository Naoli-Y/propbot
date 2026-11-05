import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const safeEqual = (a, b) => {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

export const signToken = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

async function userFromBearer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    return user && user.active ? user : null;
  } catch {
    return null;
  }
}

/** Requires a logged-in dashboard user (JWT). */
export const requireUser = wrap(async (req, res, next) => {
  const user = await userFromBearer(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  req.actor = user.email;
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission for this action' });
  next();
};

/** Blocks viewers from mutating data. */
export const requireWriter = requireRole('admin', 'manager');

/** Dashboard JWT OR webhook API key (x-api-key). Used for lead ingestion. */
export const requireUserOrApiKey = wrap(async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key) {
    if (!safeEqual(key, env.webhookApiKey)) return res.status(401).json({ error: 'Invalid API key' });
    req.actor = 'webhook';
    req.viaApiKey = true;
    return next();
  }
  const user = await userFromBearer(req);
  if (!user) return res.status(401).json({ error: 'Authentication required (Bearer token or x-api-key)' });
  if (user.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot create leads' });
  req.user = user;
  req.actor = user.email;
  next();
});

/** Cloud Scheduler secret (x-cron-secret) OR an admin/manager JWT for manual runs. */
export const requireCronOrUser = wrap(async (req, res, next) => {
  const secret = req.headers['x-cron-secret'];
  if (secret) {
    if (!safeEqual(secret, env.cronSecret)) return res.status(401).json({ error: 'Invalid cron secret' });
    req.actor = 'cloud-scheduler';
    req.trigger = 'scheduler';
    return next();
  }
  const user = await userFromBearer(req);
  if (!user || user.role === 'viewer') return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  req.actor = user.email;
  req.trigger = 'manual';
  next();
});
