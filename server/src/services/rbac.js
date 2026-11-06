import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { DEFAULT_ROLES, SUPER_ADMIN, resolvePermissions } from '../config/permissions.js';
import { logger } from '../utils/logger.js';

// Roles are read on every authenticated request, so keep a short in-memory cache.
// Writes on this instance clear it immediately; other instances pick changes up within TTL.
const TTL_MS = 15000;
let cache = { at: 0, roles: null };

export function bustRoleCache() {
  cache = { at: 0, roles: null };
}

export async function getRolesMap() {
  if (cache.roles && Date.now() - cache.at < TTL_MS) return cache.roles;
  const roles = await Role.find().lean();
  cache = { at: Date.now(), roles: new Map(roles.map((r) => [r.key, r])) };
  return cache.roles;
}

export async function getRole(key) {
  return (await getRolesMap()).get(key) || null;
}

/** Effective permission list for a user document. */
export async function permissionsFor(user) {
  const role = await getRole(user.role);
  return resolvePermissions(user.role, role?.permissions || [], user.permission_grants || [], user.permission_denies || []);
}

/** User JSON enriched with role name + effective permissions (what the dashboard needs). */
export async function userWithPermissions(user) {
  const role = await getRole(user.role);
  return {
    ...user.toJSON(),
    role_name: role?.name || user.role,
    permissions: resolvePermissions(user.role, role?.permissions || [], user.permission_grants || [], user.permission_denies || []),
  };
}

/** Creates any missing default role. Existing roles keep their (possibly edited) permissions. */
export async function ensureRoles() {
  for (const def of DEFAULT_ROLES) {
    const exists = await Role.exists({ key: def.key });
    if (!exists) {
      await Role.create({ ...def, is_system: true, locked: Boolean(def.locked) });
      logger.info('Created default role', { role: def.key });
    } else if (def.locked) {
      // Super admin always holds the full, current permission list.
      await Role.updateOne({ key: def.key }, { $set: { permissions: def.permissions, locked: true, is_system: true } });
    }
  }
  bustRoleCache();
}

/** Upgrade path from fixed roles: make sure at least one active super admin exists. */
export async function ensureSuperAdmin() {
  if (await User.exists({ role: SUPER_ADMIN, active: true })) return;
  const oldest = await User.findOne({ role: 'admin', active: true }).sort({ created_at: 1 });
  if (oldest) {
    oldest.role = SUPER_ADMIN;
    await oldest.save();
    logger.info('Promoted user to super admin', { email: oldest.email });
  }
}
