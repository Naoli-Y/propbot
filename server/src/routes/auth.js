import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User, hashToken, RESET_TOKEN_MINUTES } from '../models/User.js';
import { sendEmail, sendgridEnabled, buildPasswordResetEmail } from '../services/email.js';
import { baseUrl } from '../services/portal.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, validateObjectId } from '../middleware/errors.js';
import { requireUser, requirePermission, signToken } from '../middleware/auth.js';
import { cleanString, normalizeEmail } from '../utils/normalize.js';
import { getRole, getRolesMap, userWithPermissions } from '../services/rbac.js';
import { isPermission, SUPER_ADMIN, resolvePermissions } from '../config/permissions.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts, try again later' } });

const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many password reset requests — try again in 15 minutes.' } });

const validPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;

/**
 * Emails a reset link. Without SendGrid the link is written to the server log instead
 * (and returned to an admin who requested it), so resets still work in local setups.
 */
async function sendResetLink(req, user, { requestedByAdmin = false } = {}) {
  const raw = user.createResetToken();
  await user.save();
  const link = `${baseUrl(req)}/reset-password/${raw}`;
  const mail = buildPasswordResetEmail(user, { link, minutes: RESET_TOKEN_MINUTES, requestedByAdmin });
  try {
    const result = await sendEmail({ to: user.email, ...mail, categories: ['password-reset'] });
    if (!sendgridEnabled()) logger.warn('Password reset link (SendGrid not configured — share it manually)', { email: user.email, link });
    return { delivered: result.status === 'sent', link: sendgridEnabled() ? null : link };
  } catch (err) {
    logger.error('Password reset email failed', { email: user.email, error: err.message });
    return { delivered: false, link: null, error: err.message };
  }
}
const cleanPerms = (list) => [...new Set((Array.isArray(list) ? list : []).filter(isPermission))];
const forbidden = (res, error) => res.status(403).json({ error });

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email }).select('+password_hash');
    if (!user || !user.active || !(await user.checkPassword(password))) return res.status(401).json({ error: 'Invalid email or password' });
    user.last_login_at = new Date();
    await user.save();
    res.json({ token: signToken(user), user: await userWithPermissions(user) });
  })
);

// ─── Forgot / reset password ─────────────────────────────────
// Always answers the same way so nobody can find out which emails have accounts.
router.post(
  '/forgot-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (email) {
      const user = await User.findOne({ email, active: true });
      if (user) await sendResetLink(req, user);
    }
    res.json({ ok: true, message: `If an account exists for that email, we've sent a link to reset the password. It expires in ${RESET_TOKEN_MINUTES} minutes.` });
  })
);

async function findByResetToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  return User.findOne({ reset_token_hash: hashToken(token), reset_token_expires: { $gt: new Date() }, active: true }).select('+reset_token_hash +reset_token_expires +password_hash');
}

// Lets the reset page say "link expired" before the user types a new password.
router.get('/reset-password/:token', resetLimiter, asyncHandler(async (req, res) => {
  const user = await findByResetToken(req.params.token);
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  const [local, domain] = user.email.split('@');
  res.json({ ok: true, email: `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}` });
}));

router.post(
  '/reset-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const user = await findByResetToken(token);
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    await user.setPassword(password);
    user.clearResetToken();
    user.password_changed_at = new Date(); // signs out every existing session
    await user.save();
    logger.info('Password reset completed', { email: user.email });
    res.json({ ok: true, message: 'Your password has been changed. Sign in with your new password.' });
  })
);

// The dashboard polls this, so permission changes show up without logging out.
router.get('/me', requireUser, asyncHandler(async (req, res) => res.json({ user: await userWithPermissions(req.user) })));

router.patch(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password_hash');
    if (req.body?.name) user.name = cleanString(req.body.name, 120);
    if (req.body?.newPassword) {
      if (!(await user.checkPassword(req.body.currentPassword || ''))) return res.status(400).json({ error: 'Current password is incorrect' });
      if (!validPassword(req.body.newPassword)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
      await user.setPassword(req.body.newPassword);
      user.password_changed_at = new Date(); // signs out other devices
    }
    await user.save();
    // A fresh token keeps this browser signed in after a password change.
    res.json({ user: await userWithPermissions(user), token: signToken(user) });
  })
);

// ─── Team management (users.manage) ──────────────────────────
const isSuper = (req) => req.user.role === SUPER_ADMIN;

/**
 * Stops privilege escalation: someone who isn't a super admin may only hand out
 * permissions they hold themselves (through a role or personal grants).
 */
async function checkCanGive(req, roleKey, grants = []) {
  if (isSuper(req)) return null;
  if (roleKey === SUPER_ADMIN) return 'Only a super admin can assign the Super Admin role';
  const role = await getRole(roleKey);
  const wanted = [...(role?.permissions || []), ...grants];
  const missing = wanted.filter((p) => !req.can(p));
  return missing.length ? `You can't give permissions you don't have yourself: ${[...new Set(missing)].join(', ')}` : null;
}

async function activeSuperAdmins(excludeId) {
  return User.countDocuments({ role: SUPER_ADMIN, active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
}

router.get('/users', requireUser, requirePermission('users.manage'), asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ created_at: 1 });
  res.json({ users: await Promise.all(users.map(userWithPermissions)) });
}));

router.post(
  '/users',
  requireUser,
  requirePermission('users.manage'),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanString(req.body?.name, 120);
    const role = String(req.body?.role || 'manager').toLowerCase();
    if (!email || !name) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!(await getRole(role))) return res.status(400).json({ error: `Unknown role "${role}"` });
    const problem = await checkCanGive(req, role);
    if (problem) return forbidden(res, problem);
    if (await User.exists({ email })) return res.status(409).json({ error: 'A user with this email already exists' });
    const user = new User({ email, name, role });
    await user.setPassword(req.body.password);
    await user.save();
    res.status(201).json({ user: await userWithPermissions(user) });
  })
);

router.patch(
  '/users/:id',
  requireUser,
  requirePermission('users.manage'),
  validateObjectId(),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('+password_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isSelf = user._id.equals(req.user._id);
    const body = req.body || {};
    if (user.role === SUPER_ADMIN && !isSuper(req)) return forbidden(res, 'Only a super admin can change a super admin');

    if (body.role !== undefined) {
      const role = String(body.role).toLowerCase();
      if (!(await getRole(role))) return res.status(400).json({ error: `Unknown role "${role}"` });
      if (isSelf && role !== user.role) return res.status(400).json({ error: 'You cannot change your own role' });
      const problem = await checkCanGive(req, role);
      if (problem) return forbidden(res, problem);
      if (user.role === SUPER_ADMIN && role !== SUPER_ADMIN && (await activeSuperAdmins(user._id)) === 0) {
        return res.status(400).json({ error: 'There must always be at least one active super admin' });
      }
      user.role = role;
    }

    if (body.permission_grants !== undefined || body.permission_denies !== undefined) {
      if (isSelf && !isSuper(req)) return res.status(400).json({ error: 'You cannot change your own permissions' });
      const grants = body.permission_grants !== undefined ? cleanPerms(body.permission_grants) : user.permission_grants;
      const denies = body.permission_denies !== undefined ? cleanPerms(body.permission_denies) : user.permission_denies;
      const problem = await checkCanGive(req, user.role, grants);
      if (problem) return forbidden(res, problem);
      user.permission_grants = grants;
      user.permission_denies = denies.filter((p) => !grants.includes(p));
    }

    if (typeof body.active === 'boolean') {
      if (isSelf && !body.active) return res.status(400).json({ error: 'You cannot deactivate yourself' });
      if (!body.active && user.role === SUPER_ADMIN && (await activeSuperAdmins(user._id)) === 0) {
        return res.status(400).json({ error: 'There must always be at least one active super admin' });
      }
      user.active = body.active;
    }
    if (body.name) user.name = cleanString(body.name, 120);
    if (body.password) {
      if (!validPassword(body.password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      await user.setPassword(body.password);
      user.password_changed_at = new Date();
    }
    await user.save();
    res.json({ user: await userWithPermissions(user) });
  })
);

// Admin sends a user a reset link (e.g. they forgot their password or are new).
router.post(
  '/users/:id/send-reset',
  requireUser,
  requirePermission('users.manage'),
  validateObjectId(),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.active) return res.status(400).json({ error: 'Activate this user first' });
    if (user.role === SUPER_ADMIN && !isSuper(req)) return forbidden(res, 'Only a super admin can reset a super admin');
    const result = await sendResetLink(req, user, { requestedByAdmin: true });
    if (result.error) return res.status(502).json({ error: `Could not send the email: ${result.error}` });
    res.json({ ok: true, delivered: result.delivered, link: result.link });
  })
);

router.delete(
  '/users/:id',
  requireUser,
  requirePermission('users.manage'),
  validateObjectId(),
  asyncHandler(async (req, res) => {
    if (req.user._id.equals(req.params.id)) return res.status(400).json({ error: 'You cannot delete yourself' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === SUPER_ADMIN && !isSuper(req)) return forbidden(res, 'Only a super admin can remove a super admin');
    if (user.role === SUPER_ADMIN && (await activeSuperAdmins(user._id)) === 0) return res.status(400).json({ error: 'There must always be at least one active super admin' });
    await user.deleteOne();
    res.json({ ok: true });
  })
);

// Preview what a user would be able to do with a given role + overrides (used by the editor).
router.post('/users/preview-permissions', requireUser, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const roles = await getRolesMap();
  const role = roles.get(String(req.body?.role || ''));
  res.json({ permissions: resolvePermissions(req.body?.role, role?.permissions || [], cleanPerms(req.body?.permission_grants), cleanPerms(req.body?.permission_denies)) });
}));

export default router;
