import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Trash2, ShieldCheck, Lock, Plus, RotateCcw, Pencil, SlidersHorizontal, Check, Minus, Save, Undo2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmModal, Field, Modal, PageLoader, Spinner } from './ui.jsx';

// ─── Shared data hook ───────────────────────────────────────
function useRolesCatalog() {
  const toast = useToast();
  const [roles, setRoles] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([api.get('/roles'), api.get('/roles/permissions')]);
      setRoles(r.data.roles);
      setCatalog(p.data.permissions);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const groups = useMemo(() => {
    const g = new Map();
    catalog.forEach((p) => { if (!g.has(p.group)) g.set(p.group, []); g.get(p.group).push(p); });
    return [...g.entries()];
  }, [catalog]);
  return { roles, catalog, groups, reload: load };
}

const effective = (role, grants = [], denies = [], allKeys = []) => {
  if (role?.key === 'super_admin') return new Set(allKeys);
  const s = new Set(role?.permissions || []);
  grants.forEach((p) => s.add(p));
  denies.forEach((p) => s.delete(p));
  return s;
};

// ─── Roles & permissions matrix (roles.manage) ──────────────
export function RolesEditor() {
  const toast = useToast();
  const { refresh, user: me } = useAuth();
  const { roles, catalog, groups, reload } = useRolesCatalog();
  const [draft, setDraft] = useState({}); // roleKey -> Set of permissions
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // role being renamed / created ({} for new)
  const [form, setForm] = useState({ name: '', description: '', copy_from: '' });
  const [confirm, setConfirm] = useState(null); // { type: 'delete'|'reset', role }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (roles) setDraft(Object.fromEntries(roles.map((r) => [r.key, new Set(r.permissions)])));
  }, [roles]);

  const dirtyKeys = useMemo(() => (roles || []).filter((r) => {
    const d = draft[r.key];
    if (!d || r.locked) return false;
    return d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p));
  }).map((r) => r.key), [roles, draft]);

  const toggle = (roleKey, perm) => setDraft((d) => {
    const s = new Set(d[roleKey]);
    s.has(perm) ? s.delete(perm) : s.add(perm);
    return { ...d, [roleKey]: s };
  });
  const toggleGroup = (roleKey, perms, on) => setDraft((d) => {
    const s = new Set(d[roleKey]);
    perms.forEach((p) => (on ? s.add(p.key) : s.delete(p.key)));
    return { ...d, [roleKey]: s };
  });

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const key of dirtyKeys) {
        await api.patch(`/roles/${key}`, { permissions: [...draft[key]] });
      }
      toast(`Saved ${dirtyKeys.length} role(s). Changes apply to their users right away.`);
      await reload();
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(Object.fromEntries(roles.map((r) => [r.key, new Set(r.permissions)])));

  const openCreate = () => { setForm({ name: '', description: '', copy_from: 'viewer' }); setEditing({}); };
  const openRename = (r) => { setForm({ name: r.name, description: r.description || '', copy_from: '' }); setEditing(r); };

  const submitRole = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing.key) await api.patch(`/roles/${editing.key}`, { name: form.name, description: form.description });
      else await api.post('/roles', { name: form.name, description: form.description, copy_from: form.copy_from || undefined });
      toast(editing.key ? 'Role updated' : 'Role created — now tick its permissions');
      setEditing(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm.type === 'delete') await api.delete(`/roles/${confirm.role.key}`);
      else await api.post(`/roles/${confirm.role.key}/reset`);
      toast(confirm.type === 'delete' ? 'Role deleted' : 'Role reset to its default permissions');
      setConfirm(null);
      await reload();
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!roles) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">Roles & permissions</p>
          <p className="text-xs text-slate-500">Tick what each role can see and do. Changes reach users within a minute — no need to log out. Personal exceptions are set per user in the Team tab.</p>
        </div>
        <button className="btn-secondary btn-sm shrink-0" onClick={openCreate}><Plus className="h-3.5 w-3.5" />New role</button>
      </div>

      <div className="card overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-line">
              <th className="w-[38%] px-4 py-3 text-left align-bottom text-xs font-bold uppercase tracking-wide text-slate-500">Permission</th>
              {roles.map((r) => (
                <th key={r.key} className="px-2 py-3 text-center align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1 text-xs font-extrabold text-slate-800">{r.locked && <Lock className="h-3 w-3 text-ember-600" />}{r.name}</span>
                    <span className="text-[10px] font-medium text-slate-400">{r.user_count} user{r.user_count === 1 ? '' : 's'}{dirtyKeys.includes(r.key) && <span className="ml-1 text-ember-600">· edited</span>}</span>
                    {!r.locked && (
                      <span className="flex gap-0.5">
                        <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Rename" onClick={() => openRename(r)}><Pencil className="h-3 w-3" /></button>
                        {r.is_system
                          ? <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Reset to default" onClick={() => setConfirm({ type: 'reset', role: r })}><RotateCcw className="h-3 w-3" /></button>
                          : <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete role" onClick={() => setConfirm({ type: 'delete', role: r })}><Trash2 className="h-3 w-3" /></button>}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => (
              <Fragment key={group}>
                <tr className="bg-slate-50/80">
                  <td className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{group}</td>
                  {roles.map((r) => {
                    const set = draft[r.key] || new Set();
                    const on = perms.filter((p) => set.has(p.key)).length;
                    return (
                      <td key={r.key} className="px-2 py-2 text-center">
                        {!r.locked && (
                          <button className="text-[10px] font-semibold text-ink-600 hover:underline" onClick={() => toggleGroup(r.key, perms, on < perms.length)}>
                            {on < perms.length ? 'all' : 'none'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-t border-line hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-700">{p.label}</p>
                      <p className="text-xs text-slate-400">{p.description}</p>
                    </td>
                    {roles.map((r) => {
                      const checked = r.locked || draft[r.key]?.has(p.key);
                      const lockSelf = r.key === me.role && p.key === 'roles.manage';
                      return (
                        <td key={r.key} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
                            checked={Boolean(checked)}
                            disabled={r.locked || lockSelf}
                            title={r.locked ? 'Super Admin always has every permission' : lockSelf ? 'You can’t remove this from your own role' : `${r.name}: ${p.label}`}
                            onChange={() => toggle(r.key, p.key)}
                            aria-label={`${r.name}: ${p.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lift animate-rise">
          <span className="font-semibold">Unsaved changes to {dirtyKeys.length} role(s)</span>
          <span className="flex-1" />
          <button className="btn-sm btn bg-white/10 hover:bg-white/20" onClick={discard} disabled={saving}><Undo2 className="h-3.5 w-3.5" />Discard</button>
          <button className="btn-sm btn-accent" onClick={saveAll} disabled={saving}>{saving ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Save className="h-3.5 w-3.5" />}Save changes</button>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.key ? `Edit ${editing.name}` : 'New role'}>
        <form onSubmit={submitRole} className="space-y-4">
          <Field label="Name"><input className="input" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Disposition Manager" autoFocus /></Field>
          <Field label="Description"><input className="input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {!editing?.key && (
            <Field label="Start from" hint="Copies that role’s permissions — adjust them in the table afterwards">
              <select className="input" value={form.copy_from} onChange={(e) => setForm({ ...form, copy_from: e.target.value })}>
                <option value="">No permissions</option>
                {roles.filter((r) => r.key !== 'super_admin').map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </Field>
          )}
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{editing?.key ? 'Save' : 'Create role'}</button></div>
        </form>
      </Modal>
      <ConfirmModal open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={runConfirm} busy={busy} danger={confirm?.type === 'delete'}
        confirmLabel={confirm?.type === 'delete' ? 'Delete role' : 'Reset role'}
        title={confirm?.type === 'delete' ? `Delete “${confirm?.role.name}”?` : `Reset “${confirm?.role.name}”?`}
        body={confirm?.type === 'delete' ? 'Only roles with no users can be deleted.' : 'Its permissions go back to the defaults. Users with this role are affected immediately.'} />
      <p className="text-xs text-slate-400">{catalog.length} permissions · Super Admin is locked so you can never lock everyone out.</p>
    </div>
  );
}

// ─── Per-user permission overrides ──────────────────────────
function UserPermissionsModal({ user, roles, groups, catalog, open, onClose, onSaved }) {
  const toast = useToast();
  const [role, setRole] = useState(user?.role);
  const [grants, setGrants] = useState([]);
  const [denies, setDenies] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && user) { setRole(user.role); setGrants(user.permission_grants || []); setDenies(user.permission_denies || []); }
  }, [open, user]);

  if (!user) return null;
  const roleObj = roles.find((r) => r.key === role);
  const allKeys = catalog.map((p) => p.key);
  const eff = effective(roleObj, grants, denies, allKeys);
  const isSuper = role === 'super_admin';

  const setMode = (key, mode) => {
    setGrants((g) => (mode === 'grant' ? [...new Set([...g, key])] : g.filter((x) => x !== key)));
    setDenies((d) => (mode === 'deny' ? [...new Set([...d, key])] : d.filter((x) => x !== key)));
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { permission_grants: grants, permission_denies: denies };
      if (role !== user.role) body.role = role;
      await api.patch(`/auth/users/${user.id}`, body);
      toast(`Permissions updated for ${user.name}`);
      onSaved();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Permissions · ${user.name}`} width="max-w-3xl"
      footer={<><span className="mr-auto self-center text-xs text-slate-500">{eff.size} of {allKeys.length} permissions{grants.length + denies.length ? ` · ${grants.length} granted, ${denies.length} removed` : ''}</span>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Save</button></>}>
      <Field label="Role" hint="The role gives the defaults. Use the switches below for exceptions just for this person.">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </Field>
      {isSuper ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-ember-50 px-3 py-2.5 text-sm text-ember-700"><Lock className="h-4 w-4" />Super Admins always have every permission.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map(([group, perms]) => (
            <div key={group}>
              <p className="eyebrow mb-2">{group}</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {perms.map((p) => {
                  const fromRole = roleObj?.permissions.includes(p.key);
                  const mode = grants.includes(p.key) ? 'grant' : denies.includes(p.key) ? 'deny' : 'role';
                  const on = eff.has(p.key);
                  return (
                    <li key={p.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-700">{p.label}</p>
                        <p className="text-xs text-slate-400">{p.description}</p>
                      </div>
                      <div className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold">
                        {[['role', `Role (${fromRole ? 'on' : 'off'})`], ['grant', 'Allow'], ['deny', 'Block']].map(([m, label]) => (
                          <button key={m} type="button" onClick={() => setMode(p.key, m)}
                            className={`px-2.5 py-1.5 transition ${mode === m ? (m === 'grant' ? 'bg-emerald-600 text-white' : m === 'deny' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white') : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Team (users.manage) ────────────────────────────────────
export function Team() {
  const toast = useToast();
  const { user: me, can, isSuperAdmin } = useAuth();
  const { roles, catalog, groups } = useRolesCatalog();
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'manager' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [permsFor, setPermsFor] = useState(null);

  const load = useCallback(() => api.get('/auth/users').then((r) => setUsers(r.data.users)).catch((e) => toast(errorMessage(e), 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/users', form);
      toast('User created');
      setAdding(false);
      setForm({ name: '', email: '', password: '', role: 'manager' });
      load();
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  const patch = async (u, body) => {
    try { await api.patch(`/auth/users/${u.id}`, body); load(); } catch (err) { toast(errorMessage(err), 'error'); }
  };

  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/auth/users/${del.id}`); toast('User removed'); setDel(null); load(); } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  if (!users || !roles) return <PageLoader />;
  const assignable = roles.filter((r) => isSuperAdmin || r.key !== 'super_admin');
  const locked = (u) => u.id === me.id || (u.role === 'super_admin' && !isSuperAdmin);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">Team members</p>
        <button className="btn-primary btn-sm" onClick={() => setAdding(true)}><UserPlus className="h-3.5 w-3.5" />Add user</button>
      </div>
      <ul className="divide-y divide-line">
        {users.map((u) => {
          const overrides = (u.permission_grants?.length || 0) + (u.permission_denies?.length || 0);
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${u.role === 'super_admin' ? 'bg-ember-100 text-ember-700' : 'bg-ink-100 text-ink-700'}`}>{u.name[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  {u.name} {u.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                  {u.role === 'super_admin' && <ShieldCheck className="h-3.5 w-3.5 text-ember-600" />}
                  {overrides > 0 && <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-bold text-ink-700">{overrides} custom</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email} · {u.permissions.length} permissions · last login {u.last_login_at ? dateTime(u.last_login_at) : 'never'}</p>
              </div>
              <select className="input w-auto py-1.5 text-xs" value={u.role} disabled={locked(u)} onChange={(e) => patch(u, { role: e.target.value })} aria-label="Role">
                {(locked(u) ? roles : assignable).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
              <button className="btn-secondary btn-sm" disabled={locked(u)} onClick={() => setPermsFor(u)} title="Personal permissions"><SlidersHorizontal className="h-3.5 w-3.5" />Permissions</button>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" className="accent-ink-900" checked={u.active} disabled={locked(u)} onChange={(e) => patch(u, { active: e.target.checked })} />Active
              </label>
              <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={locked(u)} onClick={() => setDel(u)} aria-label="Delete user"><Trash2 className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>
      {!can('roles.manage') && <p className="border-t border-line px-5 py-3 text-xs text-slate-400">Only a super admin can change what each role is allowed to do.</p>}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add team member">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 8 characters"><input className="input" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role" hint={assignable.find((r) => r.key === form.role)?.description}>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Create</button></div>
        </form>
      </Modal>
      <UserPermissionsModal user={permsFor} roles={assignable} groups={groups} catalog={catalog} open={Boolean(permsFor)} onClose={() => setPermsFor(null)} onSaved={load} />
      <ConfirmModal open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} busy={busy} danger confirmLabel="Remove" title="Remove user?" body={del ? `${del.name} (${del.email}) will lose access.` : ''} />
    </div>
  );
}
