import { Router } from 'express';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireUser, requirePermission } from '../middleware/auth.js';
import { cleanString } from '../utils/normalize.js';
import { bustRoleCache } from '../services/rbac.js';
import { PERMISSIONS, DEFAULT_ROLES, isPermission } from '../config/permissions.js';

// Roles & permissions editor (super admin by default — anyone with roles.manage).
const router = Router();
router.use(requireUser);

const cleanPerms = (list) => [...new Set((Array.isArray(list) ? list : []).filter(isPermission))];

async function withCounts(roles) {
  const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  return roles.map((r) => ({ ...r.toJSON(), user_count: map[r.key] || 0 }));
}

// Catalog of every permission (grouped in the UI).
router.get('/permissions', requirePermission('roles.manage', 'users.manage'), (_req, res) => res.json({ permissions: PERMISSIONS }));

// Role list — also needed by team managers to assign roles.
router.get('/', requirePermission('roles.manage', 'users.manage'), asyncHandler(async (_req, res) => {
  const roles = await Role.find().sort({ is_system: -1, created_at: 1 });
  res.json({ roles: await withCounts(roles) });
}));

router.post(
  '/',
  requirePermission('roles.manage'),
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name, 60);
    if (!name) return res.status(400).json({ error: 'Role name is required' });
    let key = String(req.body?.key || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!/^[a-z]/.test(key)) key = `role_${key}`;
    if (await Role.exists({ key })) return res.status(409).json({ error: `A role with key "${key}" already exists` });
    let permissions = cleanPerms(req.body?.permissions);
    if (req.body?.copy_from) {
      const src = await Role.findOne({ key: req.body.copy_from });
      if (src) permissions = [...src.permissions];
    }
    const role = await Role.create({ key, name, description: cleanString(req.body?.description, 300), permissions, updated_by: req.actor });
    bustRoleCache();
    res.status(201).json({ role: (await withCounts([role]))[0] });
  })
);

router.patch(
  '/:key',
  requirePermission('roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ key: req.params.key });
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.locked) return res.status(400).json({ error: `${role.name} always has every permission and can't be edited` });
    // Don't let an editor lock themselves out of this screen.
    if (req.user.role === role.key && req.body?.permissions && !cleanPerms(req.body.permissions).includes('roles.manage')) {
      return res.status(400).json({ error: 'You cannot remove “Manage roles & permissions” from your own role' });
    }
    if (req.body?.name) role.name = cleanString(req.body.name, 60);
    if (req.body?.description !== undefined) role.description = cleanString(req.body.description, 300);
    if (req.body?.permissions) role.permissions = cleanPerms(req.body.permissions);
    role.updated_by = req.actor;
    await role.save();
    bustRoleCache();
    res.json({ role: (await withCounts([role]))[0] });
  })
);

// Restore a default role to its original permissions.
router.post(
  '/:key/reset',
  requirePermission('roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ key: req.params.key });
    const def = DEFAULT_ROLES.find((d) => d.key === req.params.key);
    if (!role || !def) return res.status(404).json({ error: 'Only default roles can be reset' });
    if (role.locked) return res.status(400).json({ error: 'This role cannot be changed' });
    if (req.user.role === role.key && !def.permissions.includes('roles.manage')) {
      return res.status(400).json({ error: 'Resetting your own role would remove your access to this screen' });
    }
    Object.assign(role, { name: def.name, description: def.description, permissions: def.permissions, updated_by: req.actor });
    await role.save();
    bustRoleCache();
    res.json({ role: (await withCounts([role]))[0] });
  })
);

router.delete(
  '/:key',
  requirePermission('roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ key: req.params.key });
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(400).json({ error: 'Default roles cannot be deleted (you can reset them instead)' });
    const users = await User.countDocuments({ role: role.key });
    if (users) return res.status(409).json({ error: `${users} user(s) still have this role — move them to another role first` });
    await role.deleteOne();
    bustRoleCache();
    res.json({ ok: true });
  })
);

export default router;
