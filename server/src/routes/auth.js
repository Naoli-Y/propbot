import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { asyncHandler, validateObjectId } from '../middleware/errors.js';
import { requireUser, requireRole, signToken } from '../middleware/auth.js';
import { cleanString, normalizeEmail } from '../utils/normalize.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts, try again later' } });

const validPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;

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
    res.json({ token: signToken(user), user });
  })
);

router.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

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
    }
    await user.save();
    res.json({ user });
  })
);

// ─── User management (admin) ─────────────────────────────────
router.get('/users', requireUser, requireRole('admin'), asyncHandler(async (_req, res) => {
  res.json({ users: await User.find().sort({ created_at: 1 }) });
}));

router.post(
  '/users',
  requireUser,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanString(req.body?.name, 120);
    const role = ['admin', 'manager', 'viewer'].includes(req.body?.role) ? req.body.role : 'manager';
    if (!email || !name) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await User.exists({ email })) return res.status(409).json({ error: 'A user with this email already exists' });
    const user = new User({ email, name, role });
    await user.setPassword(req.body.password);
    await user.save();
    res.status(201).json({ user });
  })
);

router.patch(
  '/users/:id',
  requireUser,
  requireRole('admin'),
  validateObjectId(),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('+password_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isSelf = user._id.equals(req.user._id);
    if (req.body?.role && ['admin', 'manager', 'viewer'].includes(req.body.role)) {
      if (isSelf && req.body.role !== 'admin') return res.status(400).json({ error: 'You cannot demote yourself' });
      user.role = req.body.role;
    }
    if (typeof req.body?.active === 'boolean') {
      if (isSelf && !req.body.active) return res.status(400).json({ error: 'You cannot deactivate yourself' });
      user.active = req.body.active;
    }
    if (req.body?.password) {
      if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      await user.setPassword(req.body.password);
    }
    await user.save();
    res.json({ user });
  })
);

router.delete(
  '/users/:id',
  requireUser,
  requireRole('admin'),
  validateObjectId(),
  asyncHandler(async (req, res) => {
    if (req.user._id.equals(req.params.id)) return res.status(400).json({ error: 'You cannot delete yourself' });
    const r = await User.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  })
);

export default router;
