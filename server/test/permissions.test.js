import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PERMISSION_KEYS, DEFAULT_ROLES, resolvePermissions, SUPER_ADMIN } from '../src/config/permissions.js';

const role = (k) => DEFAULT_ROLES.find((r) => r.key === k);

test('catalog is well-formed', () => {
  assert.equal(new Set(PERMISSION_KEYS).size, PERMISSIONS.length, 'no duplicate keys');
  for (const r of DEFAULT_ROLES) for (const p of r.permissions) assert.ok(PERMISSION_KEYS.includes(p), `${r.key}: unknown ${p}`);
});

test('default roles match the screens each role used to see', () => {
  assert.deepEqual(role(SUPER_ADMIN).permissions, PERMISSION_KEYS);
  assert.ok(!role('admin').permissions.includes('roles.manage'));
  assert.ok(role('admin').permissions.includes('users.manage'));
  const inv = role('investor').permissions;
  assert.ok(inv.includes('investor.view') && inv.includes('offers.approve') && inv.includes('offers.decide'));
  assert.ok(!inv.includes('leads.edit') && !inv.includes('dashboard.view') && !inv.includes('leads.create'));
  const viewer = role('viewer').permissions;
  assert.ok(!viewer.some((p) => /create|edit|delete|move|approve|manage/.test(p)));
});

test('effective permissions apply grants and denies', () => {
  const base = role('viewer').permissions;
  const eff = resolvePermissions('viewer', base, ['leads.notes', 'bogus.perm'], ['leads.export']);
  assert.ok(eff.includes('leads.notes'));
  assert.ok(!eff.includes('leads.export'));
  assert.ok(!eff.includes('bogus.perm'));
  assert.deepEqual(resolvePermissions(SUPER_ADMIN, [], [], ['roles.manage']), PERMISSION_KEYS, 'super admin cannot be restricted');
  assert.deepEqual(resolvePermissions('ghost', undefined, [], []), [], 'unknown role has nothing');
});
