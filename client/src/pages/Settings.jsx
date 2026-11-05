import { useCallback, useEffect, useState } from 'react';
import { Bot, MapPin, Mail, Database, Play, Copy, CheckCircle2, XCircle, UserPlus, Trash2, Webhook, CalendarClock, Users, KeyRound, Plug } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { PageHeader } from '../components/Layout.jsx';
import { ConfirmModal, Field, Modal, PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function Status({ ok, okLabel = 'Connected', offLabel = 'Not configured' }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{okLabel}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><XCircle className="h-3.5 w-3.5" />{offLabel}</span>;
}

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-ink-950 p-4 pr-12 font-mono text-xs leading-relaxed text-ink-100 scrollbar-thin">{text}</pre>
      <button className="absolute right-2 top-2 rounded-md p-1.5 text-ink-200 hover:bg-white/10" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy">
        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Integrations({ sys }) {
  const items = [
    { icon: Bot, name: 'Google Gemini', desc: `Model ${sys.integrations.gemini.model}. Falls back to the rules engine when unavailable.`, ok: sys.integrations.gemini.enabled, hint: 'Set GEMINI_API_KEY (free key from Google AI Studio)' },
    { icon: MapPin, name: 'OpenStreetMap Nominatim', desc: `Geocoding via ${sys.integrations.nominatim.baseUrl} · ${sys.integrations.nominatim.cacheSize} cached`, ok: true, okLabel: 'Active' },
    { icon: Mail, name: 'SendGrid', desc: sys.integrations.sendgrid.enabled ? `Sending from ${sys.integrations.sendgrid.from}` : 'Emails are simulated and logged until configured.', ok: sys.integrations.sendgrid.enabled, offLabel: 'Simulated', hint: 'Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL (verified sender)' },
    { icon: Database, name: 'MongoDB', desc: `Connection ${sys.database.state}`, ok: sys.database.state === 'connected' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, name, desc, ok, okLabel, offLabel, hint }) => (
          <div key={name} className="card flex gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50"><Icon className="h-5 w-5 text-ink-600" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-800">{name}</p><Status ok={ok} okLabel={okLabel} offLabel={offLabel} /></div>
              <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
              {!ok && hint && <p className="mt-1 text-xs text-ember-700">{hint}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <p className="eyebrow mb-3">Underwriting rules</p>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Offer Drafted threshold</dt><dd className="num mt-0.5 text-lg font-semibold">≥ {sys.rules.viabilityThreshold}</dd></div>
          <div><dt className="text-xs text-slate-500">Stale after</dt><dd className="num mt-0.5 text-lg font-semibold">{sys.rules.staleLeadHours}h</dd></div>
          <div><dt className="text-xs text-slate-500">Auto-queue for approval</dt><dd className="mt-0.5 text-lg font-semibold">{sys.rules.autoQueueForApproval ? 'On' : 'Off'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">Configured with VIABILITY_THRESHOLD, STALE_LEAD_HOURS and AUTO_QUEUE_FOR_APPROVAL on the server.</p>
      </div>
    </div>
  );
}

function Jobs({ canRun }) {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState('');
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    api.get('/jobs').then((r) => setJobs(r.data.jobs)).catch(() => {});
    api.get('/jobs/runs').then((r) => setRuns(r.data.runs)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key) => {
    setRunning(key);
    try {
      const { data } = await api.post(`/jobs/${key}`);
      toast(`${data.run.job} finished in ${data.run.duration_ms}ms`);
      if (data.run.result?.preview) setPreview(data.run.result.preview);
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRunning('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {jobs.map((j) => (
          <div key={j.key} className="card flex flex-col justify-between gap-3 p-4">
            <div><p className="font-mono text-xs text-slate-400">POST /api/jobs/{j.key}</p><p className="mt-1 text-sm font-bold text-slate-800">{j.label}</p></div>
            {canRun && <button className="btn-secondary btn-sm self-start" onClick={() => run(j.key)} disabled={running === j.key}>{running === j.key ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}Run now</button>}
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <p className="eyebrow border-b border-line px-5 py-3">Recent runs</p>
        {runs.length === 0 ? <p className="px-5 py-6 text-sm text-slate-400">No job runs yet.</p> : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${r.status === 'success' ? 'bg-emerald-500' : r.status === 'failed' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="font-semibold text-slate-700">{r.job}</span>
                <span className="text-xs text-slate-400">{r.trigger} · {r.triggered_by}</span>
                <span className="flex-1 truncate font-mono text-xs text-slate-500">{r.error || (r.result ? JSON.stringify(Object.fromEntries(Object.entries(r.result).filter(([k]) => k !== 'preview' && k !== 'counts'))) : '')}</span>
                <span className="num text-xs text-slate-400">{r.duration_ms}ms · {dateTime(r.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Digest preview" width="max-w-2xl">
        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-700">{preview}</pre>
      </Modal>
    </div>
  );
}

function Integration({ sys }) {
  const origin = window.location.origin;
  const key = sys.webhook.key || '<WEBHOOK_API_KEY>';
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2"><Webhook className="h-4 w-4 text-ink-500" /><p className="text-sm font-bold text-slate-800">Lead ingestion webhook</p></div>
        <p className="mb-3 text-sm text-slate-500">Point listing sources, form tools or Zapier at this endpoint. Send the API key in the <code className="font-mono">x-api-key</code> header. Include <code className="font-mono">external_id</code> to make retries idempotent.</p>
        <CopyBlock text={`curl -X POST ${origin}/api/leads \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${key}" \\
  -d '{
    "external_id": "LIST-10293",
    "property_address": "4521 Magnolia Ave, Memphis, TN 38117",
    "seller_name": "Linda Carter",
    "seller_email": "linda@example.com",
    "asking_price": 145000,
    "property_condition": "Roof leaks, HVAC broken, outdated kitchen",
    "seller_timeline": "ASAP"
  }'`} />
        <p className="mt-2 text-xs text-slate-400">Batch: send {'{ "leads": [ ... ] }'} with up to 25 leads. Common aliases (address, price, email, notes, timeline) are accepted.</p>
      </div>
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-ink-500" /><p className="text-sm font-bold text-slate-800">GCP Cloud Scheduler</p></div>
        <p className="mb-3 text-sm text-slate-500">Create HTTP jobs that POST to the endpoints below with header <code className="font-mono">x-cron-secret</code>. {sys.scheduler.configured ? 'A cron secret is configured.' : <span className="text-ember-700">CRON_SECRET is not set on the server.</span>}</p>
        <CopyBlock text={`gcloud scheduler jobs create http propbot-audit \\
  --schedule="0 * * * *" --time-zone="America/New_York" \\
  --uri="${origin}/api/jobs/audit" --http-method=POST \\
  --headers="x-cron-secret=YOUR_CRON_SECRET"

gcloud scheduler jobs create http propbot-digest \\
  --schedule="0 8 * * 1-5" --time-zone="America/New_York" \\
  --uri="${origin}/api/jobs/digest" --http-method=POST \\
  --headers="x-cron-secret=YOUR_CRON_SECRET"

gcloud scheduler jobs create http propbot-sweep \\
  --schedule="*/15 * * * *" \\
  --uri="${origin}/api/jobs/process-pending" --http-method=POST \\
  --headers="x-cron-secret=YOUR_CRON_SECRET"`} />
      </div>
    </div>
  );
}

function Team() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'manager' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

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

  if (!users) return <PageLoader />;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">Team members</p>
        <button className="btn-primary btn-sm" onClick={() => setAdding(true)}><UserPlus className="h-3.5 w-3.5" />Add user</button>
      </div>
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-700">{u.name[0]?.toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{u.name} {u.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}</p>
              <p className="truncate text-xs text-slate-500">{u.email} · last login {u.last_login_at ? dateTime(u.last_login_at) : 'never'}</p>
            </div>
            <select className="input w-auto py-1.5 text-xs" value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })} aria-label="Role">
              <option value="admin">Admin</option><option value="manager">Manager</option><option value="viewer">Viewer</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" className="accent-ink-900" checked={u.active} disabled={u.id === me.id} onChange={(e) => patch(u, { active: e.target.checked })} />Active
            </label>
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={u.id === me.id} onClick={() => setDel(u)} aria-label="Delete user"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add team member">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 8 characters"><input className="input" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="manager">Manager — work leads, send offers</option><option value="viewer">Viewer — read only</option><option value="admin">Admin — full access</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Create</button></div>
        </form>
      </Modal>
      <ConfirmModal open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} busy={busy} danger confirmLabel="Remove" title="Remove user?" body={del ? `${del.name} (${del.email}) will lose access.` : ''} />
    </div>
  );
}

function Profile() {
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name };
      if (pw.newPassword) Object.assign(body, pw);
      const { data } = await api.patch('/auth/me', body);
      setUser(data.user);
      setPw({ currentPassword: '', newPassword: '' });
      toast('Profile saved');
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="card max-w-lg space-y-4 p-5">
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><input className="input" value={user.email} disabled /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password"><input className="input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
        <Field label="New password"><input className="input" type="password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Save</button></div>
    </form>
  );
}

export default function Settings() {
  const { isAdmin, canWrite } = useAuth();
  const [tab, setTab] = useState('integrations');
  const [sys, setSys] = useState(null);

  useEffect(() => { api.get('/system/status').then((r) => setSys(r.data)).catch(() => {}); }, []);

  const tabs = [
    { key: 'integrations', label: 'Integrations', icon: Plug },
    { key: 'jobs', label: 'Automation', icon: CalendarClock },
    { key: 'api', label: 'Webhook & scheduler', icon: Webhook },
    ...(isAdmin ? [{ key: 'team', label: 'Team', icon: Users }] : []),
    { key: 'profile', label: 'Profile', icon: KeyRound },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Integrations, automation jobs, API access and team." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line scrollbar-thin">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === key ? 'border-ink-900 text-ink-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {['integrations', 'api'].includes(tab) && !sys ? <PageLoader /> : (
        <>
          {tab === 'integrations' && <Integrations sys={sys} />}
          {tab === 'jobs' && <Jobs canRun={canWrite} />}
          {tab === 'api' && <Integration sys={sys} />}
          {tab === 'team' && isAdmin && <Team />}
          {tab === 'profile' && <Profile />}
        </>
      )}
    </div>
  );
}
