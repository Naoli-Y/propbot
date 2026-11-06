import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { permissionsFor } from '../services/rbac.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const safeEqual = (a, b) => {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// Only the user id goes in the token — role and permissions are looked up on every
// request, so changes made by the super admin take effect immediately.
export const signToken = (user) => jwt.sign({ sub: user._id.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

async function userFromBearer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return null;
    // Password was reset/changed after this token was issued → force a new login.
    if (user.password_changed_at && payload.iat * 1000 < user.password_changed_at.getTime() - 1000) return null;
    return user;
  } catch {
    return null;
  }
}

async function attachUser(req, user) {
  req.user = user;
  req.actor = user.email;
  req.permissions = new Set(await permissionsFor(user));
  req.can = (p) => req.permissions.has(p);
}

/** Requires a logged-in, active dashboard user. */
export const requireUser = wrap(async (req, res, next) => {
  const user = await userFromBearer(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  await attachUser(req, user);
  next();
});

/** Requires at least one of the listed permissions (use after requireUser). */
export const requirePermission = (...perms) => (req, res, next) => {
  if (!req.permissions) return res.status(401).json({ error: 'Authentication required' });
  if (perms.some((p) => req.permissions.has(p))) return next();
  return res.status(403).json({ error: 'You do not have permission for this action', required: perms });
};

/** Dashboard user with leads.create, OR the webhook API key (x-api-key). Used for lead ingestion. */
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
  await attachUser(req, user);
  if (!req.can('leads.create')) return res.status(403).json({ error: 'You do not have permission to create leads', required: ['leads.create'] });
  next();
});

/** Cloud Scheduler secret (x-cron-secret) OR a user with jobs.run for manual runs. */
export const requireCronOrUser = wrap(async (req, res, next) => {
  const secret = req.headers['x-cron-secret'];
  if (secret) {
    if (!safeEqual(secret, env.cronSecret)) return res.status(401).json({ error: 'Invalid cron secret' });
    req.actor = 'cloud-scheduler';
    req.trigger = 'scheduler';
    return next();
  }
  const user = await userFromBearer(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  await attachUser(req, user);
  if (!req.can('jobs.run')) return res.status(403).json({ error: 'You do not have permission to run jobs', required: ['jobs.run'] });
  req.trigger = 'manual';
  next();
});
