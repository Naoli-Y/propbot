import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Send, CheckCircle2, Pencil, Trash2, MapPin, Mail, Phone, User, Clock, Bot, Cpu, AlertTriangle,
  MessageSquarePlus, ArrowRightLeft, ShieldAlert, ExternalLink, X, Wrench, Home, CalendarClock, ClipboardCheck,
  Link2, Handshake, Gavel,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { money, number, dateTime, timeAgo } from '../lib/format.js';
import { TRANSITIONS, SEVERITY_STYLE, STAGE_HINT } from '../lib/constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, ConfirmModal, PageLoader, ScoreBadge, StatusPill, StaleTag, Spinner, Field, EmptyState, ResponseTag } from './ui.jsx';
import LeadForm, { leadToForm, formToPayload } from './LeadForm.jsx';

function Metric({ label, value, strong, tone }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`num mt-0.5 ${strong ? 'text-xl font-semibold text-slate-900' : 'text-sm font-semibold text-slate-700'} ${tone || ''}`}>{value}</p>
    </div>
  );
}

function MapPanel({ lead }) {
  if (lead.geocode_status !== 'ok' || lead.latitude == null) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 text-center text-sm text-slate-500">
        <MapPin className="h-5 w-5 text-slate-400" />
        {lead.geocode_status === 'not_found' ? 'Address not found — check the street address' : lead.geocode_status === 'failed' ? 'Geocoding failed — re-run underwriting to retry' : 'Not geocoded yet'}
      </div>
    );
  }
  const d = 0.006;
  const bbox = [lead.longitude - d, lead.latitude - d * 0.7, lead.longitude + d, lead.latitude + d * 0.7].join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lead.latitude},${lead.longitude}`;
  return (
    <div>
      <iframe title="Property location" src={src} className="h-48 w-full rounded-lg border border-line" loading="lazy" />
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span className="num">{lead.latitude.toFixed(5)}, {lead.longitude.toFixed(5)}</span>
        <a className="inline-flex items-center gap-1 font-semibold text-ink-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lead.latitude}&mlon=${lead.longitude}#map=17/${lead.latitude}/${lead.longitude}`}>Open map <ExternalLink className="h-3 w-3" /></a>
      </div>
    </div>
  );
}

const TIMELINE_ICON = {
  created: Home, geocoded: MapPin, underwritten: Bot, status_change: ArrowRightLeft, override: ShieldAlert,
  outreach: Mail, note: MessageSquarePlus, error: AlertTriangle, edit: Pencil, stale_flag: Clock,
  seller_response: Handshake, decision: Gavel,
};

function ApproveModal({ lead, open, onClose, onDone }) {
  const toast = useToast();
  const [offer, setOffer] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setOffer(String(lead.approved_offer || lead.estimated_offer_max || '')); setNote(''); }
  }, [open, lead]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      api.get(`/leads/${lead.id}/email-preview`, { params: { kind: 'cash_offer', offer: offer || undefined, note: note || undefined } })
        .then((r) => setPreview(r.data)).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, offer, note, lead.id]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/approve`, { offer: Number(String(offer).replace(/[$,]/g, '')), note: note || undefined });
      toast(data.delivery?.status === 'simulated' ? 'Offer approved — email simulated (SendGrid not configured)' : 'Offer approved and emailed to the seller');
      onDone(data.lead);
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const outOfRange = lead.estimated_offer_max && Number(offer) > lead.estimated_offer_max * 1.1;
  return (
    <Modal open={open} onClose={onClose} title="Approve & send cash offer" width="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-accent" onClick={submit} disabled={busy || !offer || !lead.seller_email}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}Approve & send</button></>}>
      {!lead.seller_email && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This lead has no seller email. Edit the lead to add one first.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Final offer (USD)" hint={`AI range ${money(lead.estimated_offer_min)} – ${money(lead.estimated_offer_max)}`} error={outOfRange ? 'More than 10% above the AI maximum — double-check' : null}>
          <input className="input num text-lg font-semibold" inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} />
        </Field>
        <Field label="Personal note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy to close in 14 days…" />
        </Field>
      </div>
      <div className="mt-5">
        <p className="label">Email preview {preview?.to && <span className="normal-case tracking-normal text-slate-400">→ {preview.to}</span>}</p>
        {preview ? (
          <div className="rounded-lg border border-line bg-slate-50">
            <div className="border-b border-line px-3 py-2 text-sm font-semibold text-slate-700">{preview.subject}</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-3 font-sans text-sm text-slate-600 scrollbar-thin">{preview.text}</pre>
          </div>
        ) : <div className="flex h-24 items-center justify-center"><Spinner /></div>}
      </div>
    </Modal>
  );
}

function EmailModal({ lead, open, onClose, onDone }) {
  const toast = useToast();
  const [kind, setKind] = useState('clarification');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setKind(lead.status === 'Outreach Sent' ? 'follow_up' : 'clarification'); setNote(''); } }, [open, lead.status]);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      api.get(`/leads/${lead.id}/email-preview`, { params: { kind, note: note || undefined } }).then((r) => setPreview(r.data)).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, kind, note, lead.id]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/outreach`, { kind, note: note || undefined });
      toast(data.delivery?.status === 'simulated' ? 'Email simulated (SendGrid not configured)' : 'Email sent');
      onDone(data.lead);
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Email the seller" width="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy || !lead.seller_email}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}Send email</button></>}>
      {!lead.seller_email && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Add a seller email address to this lead first.</p>}
      <div className="mb-4 flex gap-2">
        {[['clarification', 'Clarification questions'], ['follow_up', 'Follow-up']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`btn-sm btn ${kind === k ? 'bg-ink-900 text-white' : 'border border-line bg-white text-slate-600'}`}>{l}</button>
        ))}
      </div>
      <Field label="Extra note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {preview && (
        <div className="mt-4 rounded-lg border border-line bg-slate-50">
          <div className="border-b border-line px-3 py-2 text-sm font-semibold text-slate-700">{preview.subject}</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-3 font-sans text-sm text-slate-600 scrollbar-thin">{preview.text}</pre>
        </div>
      )}
    </Modal>
  );
}

function StatusModal({ lead, open, onClose, onDone }) {
  const toast = useToast();
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = (TRANSITIONS[lead.status] || []).filter((s) => s !== 'Outreach Sent');
  const all = ['Inbound', 'Underwritten', 'Offer Drafted', 'Awaiting Approval', 'Outreach Sent', 'Dead'].filter((s) => s !== lead.status);
  const options = override ? all : allowed;

  useEffect(() => { if (open) { setStatus(''); setReason(''); setOverride(false); } }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/status`, { status, reason: reason || undefined, override });
      toast(`Moved to ${status}`);
      onDone(data);
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change pipeline stage"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy || !status || (override && !reason.trim())}>{busy && <Spinner className="h-4 w-4 text-white" />}Move lead</button></>}>
      <p className="mb-3 text-sm text-slate-500">Currently <strong className="text-slate-700">{lead.status}</strong>. {override ? 'Manual override — any stage is allowed and the change is logged.' : 'Only transitions allowed by the state machine are shown.'}</p>
      <div className="space-y-2">
        {options.map((s) => (
          <label key={s} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${status === s ? 'border-ink-500 bg-ink-50' : 'border-line hover:bg-slate-50'}`}>
            <input type="radio" name="status" className="accent-ink-900" checked={status === s} onChange={() => setStatus(s)} />
            <StatusPill status={s} size="sm" /><span className="text-xs text-slate-500">{STAGE_HINT[s]}</span>
          </label>
        ))}
      </div>
      <Field label={override ? 'Reason (required)' : 'Reason (optional)'} className="mt-4">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Seller asked for a higher price…" />
      </Field>
      {can('status.override') && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-ink-900" checked={override} onChange={(e) => { setOverride(e.target.checked); setStatus(''); }} />
          <ShieldAlert className="h-4 w-4 text-ember-600" /> Force override (bypass state machine)
        </label>
      )}
    </Modal>
  );
}

export default function LeadDetail({ id, onClose, onChanged, onDeleted }) {
  const toast = useToast();
  const { can } = useAuth();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState('');
  const [threshold, setThreshold] = useState(70);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/leads/${id}`);
      setLead(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load lead'));
    }
  }, [id]);

  useEffect(() => { setLead(null); load(); }, [load]);
  useEffect(() => { api.get('/leads/meta/statuses').then((r) => setThreshold(r.data.threshold)).catch(() => {}); }, []);

  const update = useCallback((l) => { setLead(l); onChanged?.(l); }, [onChanged]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      const { data } = await fn();
      update(data.lead || data);
      if (success) toast(success);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const saveEdit = async (values) => {
    setBusy('edit');
    try {
      const { data } = await api.patch(`/leads/${id}`, formToPayload(values, { keepBlank: true }));
      update(data);
      setModal(null);
      toast('Lead updated');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const copyPortalLink = async () => {
    setBusy('link');
    try {
      const { data } = await api.get(`/leads/${id}/portal-link`);
      try { await navigator.clipboard.writeText(data.url); toast('Seller portal link copied'); } catch { window.prompt('Seller portal link', data.url); }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await api.delete(`/leads/${id}`);
      toast('Lead deleted');
      setModal(null);
      onDeleted?.(id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await act('note', () => api.post(`/leads/${id}/notes`, { message: note }), 'Note added');
    setNote('');
  };

  const timeline = useMemo(() => (lead?.timeline || []).slice().reverse(), [lead]);
  const reasoning = useMemo(() => (lead?.ai_reasoning || '').split('\n').map((l) => l.trim()).filter(Boolean), [lead]);

  if (error) return <EmptyState icon={AlertTriangle} title="Lead unavailable" body={error} action={onClose && <button className="btn-secondary" onClick={onClose}>Close</button>} />;
  if (!lead) return <PageLoader />;

  const canReunderwrite = ['Inbound', 'Underwritten', 'Offer Drafted', 'Dead'].includes(lead.status);
  const spread = lead.estimated_market_value && lead.asking_price ? ((lead.estimated_market_value - lead.asking_price) / lead.estimated_market_value) * 100 : null;

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="border-b border-line bg-white px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <ScoreBadge score={lead.viability_score} size="lg" threshold={threshold} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={lead.status} />
              {lead.is_stale && <StaleTag />}
              <span className="text-xs text-slate-400">#{lead.id.slice(-6)} · {lead.source} · {timeAgo(lead.created_at)}</span>
            </div>
            <h2 className="mt-1.5 text-xl font-extrabold leading-snug tracking-tight text-slate-900">{lead.property_address}</h2>
            {lead.formatted_address && <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{lead.formatted_address}</p>}
          </div>
          {onClose && <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {lead.status === 'Awaiting Approval' && can('offers.approve') && <button className="btn-accent" onClick={() => setModal('approve')}><CheckCircle2 className="h-4 w-4" />Approve & send offer</button>}
          {lead.status === 'Offer Drafted' && can('offers.submit') && (
            <button className="btn-primary" disabled={busy === 'submit'} onClick={() => act('submit', () => api.post(`/leads/${id}/submit-for-approval`), 'Submitted for approval')}>
              {busy === 'submit' ? <Spinner className="h-4 w-4 text-white" /> : <ClipboardCheck className="h-4 w-4" />}Submit for approval
            </button>
          )}
          {canReunderwrite && can('leads.underwrite') && (
            <button className="btn-secondary" disabled={busy === 'uw'} onClick={() => act('uw', () => api.post(`/leads/${id}/underwrite`), 'Underwriting refreshed')}>
              <RefreshCw className={`h-4 w-4 ${busy === 'uw' ? 'animate-spin' : ''}`} />Re-run underwriting
            </button>
          )}
          {can('leads.move', 'status.override') && <button className="btn-secondary" onClick={() => setModal('status')}><ArrowRightLeft className="h-4 w-4" />Move stage</button>}
          {can('outreach.send') && <button className="btn-secondary" onClick={() => setModal('email')}><Mail className="h-4 w-4" />Email seller</button>}
          {can('portal.link') && <button className="btn-ghost" onClick={copyPortalLink} disabled={busy === 'link'}><Link2 className="h-4 w-4" />Seller link</button>}
          {can('leads.edit') && <button className="btn-ghost" onClick={() => setModal('edit')}><Pencil className="h-4 w-4" />Edit</button>}
          {can('leads.delete') && <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => setModal('delete')}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      <div className="grid gap-4 px-4 pt-4 sm:px-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {/* Underwriting */}
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">Underwriting</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {lead.underwriting_engine && (
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${lead.underwriting_engine === 'gemini' ? 'bg-ink-50 text-ink-700' : 'bg-slate-100 text-slate-600'}`}>
                    {lead.underwriting_engine === 'gemini' ? <Bot className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                    {lead.underwriting_engine === 'gemini' ? 'Gemini AI' : 'Rules engine'}
                  </span>
                )}
                {lead.ai_confidence && <span className="capitalize">{lead.ai_confidence} confidence</span>}
                {lead.processing_ms != null && <span className={`num ${lead.processing_ms > 3000 ? 'text-ember-600' : ''}`}>{(lead.processing_ms / 1000).toFixed(2)}s</span>}
              </div>
            </div>
            <div className="rounded-xl bg-ink-900 p-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-200">Suggested cash offer</p>
              <p className="num mt-1 text-2xl font-semibold sm:text-3xl">{lead.estimated_offer_min != null ? `${money(lead.estimated_offer_min)} – ${money(lead.estimated_offer_max)}` : '—'}</p>
              {lead.approved_offer && <p className="mt-1 text-sm text-ember-400">Approved offer: <span className="num font-semibold">{money(lead.approved_offer)}</span></p>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Metric label="Asking" value={money(lead.asking_price)} />
              <Metric label="Market value" value={money(lead.estimated_market_value)} />
              <Metric label="ARV" value={money(lead.after_repair_value)} />
              <Metric label="Repairs" value={money(lead.estimated_repair_cost)} />
              <Metric label="Spread" value={spread == null ? '—' : `${spread.toFixed(1)}%`} tone={spread > 15 ? 'text-emerald-600' : spread < 0 ? 'text-red-600' : ''} />
            </div>
          </section>

          {/* Defects */}
          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2"><Wrench className="h-4 w-4 text-slate-400" /><p className="eyebrow">Extracted defects</p></div>
            {lead.defects?.length ? (
              <ul className="divide-y divide-line">
                {lead.defects.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[d.severity]}`}>{d.severity}</span>
                      <span className="text-sm text-slate-700">{d.item}</span>
                    </div>
                    <span className="num text-sm text-slate-500">{money(d.estimated_repair_cost)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400">No defects identified in the seller notes.</p>}
          </section>

          {/* AI reasoning log */}
          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2"><Bot className="h-4 w-4 text-slate-400" /><p className="eyebrow">AI reasoning audit log</p></div>
            {reasoning.length ? (
              <ol className="space-y-2">
                {reasoning.map((line, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">{i + 1}</span>
                    <span>{line.replace(/^\d+[.)]\s*/, '')}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-slate-400">Not underwritten yet.</p>}
          </section>

          {/* Seller notes */}
          <section className="card p-5">
            <p className="eyebrow mb-2">Seller condition notes</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{lead.property_condition || <span className="text-slate-400">None provided</span>}</p>
          </section>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <section className="card p-5">
            <p className="eyebrow mb-3">Seller</p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5"><User className="h-4 w-4 text-slate-400" />{lead.seller_name || <span className="text-slate-400">Unknown</span>}</li>
              <li className="flex items-center gap-2.5"><Mail className="h-4 w-4 text-slate-400" />{lead.seller_email ? <a href={`mailto:${lead.seller_email}`} className="text-ink-600 hover:underline">{lead.seller_email}</a> : <span className="text-slate-400">No email</span>}</li>
              <li className="flex items-center gap-2.5"><Phone className="h-4 w-4 text-slate-400" />{lead.seller_phone ? <a href={`tel:${lead.seller_phone}`} className="text-ink-600 hover:underline">{lead.seller_phone}</a> : <span className="text-slate-400">No phone</span>}</li>
              <li className="flex items-center gap-2.5"><CalendarClock className="h-4 w-4 text-slate-400" />{lead.seller_timeline || <span className="text-slate-400">No timeline</span>}</li>
            </ul>
            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4">
              <Metric label="Beds" value={lead.bedrooms ?? '—'} />
              <Metric label="Baths" value={lead.bathrooms ?? '—'} />
              <Metric label="Sq ft" value={number(lead.square_feet)} />
              <Metric label="Built" value={lead.year_built ?? '—'} />
            </div>
          </section>

          {lead.seller_response?.status && (
            <section className={`card p-5 ${lead.seller_response.status === 'countered' ? 'ring-2 ring-ember-400' : lead.seller_response.status === 'accepted' ? 'ring-2 ring-emerald-400' : ''}`}>
              <div className="mb-3 flex items-center justify-between gap-2"><p className="eyebrow">Seller response</p><ResponseTag response={lead.seller_response} /></div>
              {lead.seller_response.status === 'pending' ? (
                <p className="text-sm text-slate-500">Offer of <span className="num font-semibold text-slate-700">{money(lead.seller_response.offer_amount || lead.approved_offer)}</span> sent — waiting for the seller to answer on their offer page.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Metric label="Our offer" value={money(lead.seller_response.offer_amount)} />
                    {lead.seller_response.counter_offer ? <Metric label="Seller counter" value={money(lead.seller_response.counter_offer)} tone="text-ember-700" /> : <Metric label="Answered" value={timeAgo(lead.seller_response.responded_at)} />}
                  </div>
                  {lead.seller_response.counter_offer && lead.seller_response.offer_amount && (
                    <p className="mt-2 text-xs text-slate-500">Gap <span className="num font-semibold">{money(lead.seller_response.counter_offer - lead.seller_response.offer_amount)}</span>{lead.estimated_offer_max ? <> · AI max <span className="num">{money(lead.estimated_offer_max)}</span></> : null}</p>
                  )}
                  {lead.seller_response.message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">“{lead.seller_response.message}”</p>}
                  {lead.seller_response.status === 'countered' && can('leads.move') && <p className="mt-3 text-xs text-slate-500">To answer, move the lead back to <strong>Awaiting Approval</strong> and approve a new amount. The seller receives a fresh offer.</p>}
                </>
              )}
            </section>
          )}

          <section className="card p-5">
            <p className="eyebrow mb-3">Location</p>
            <MapPanel lead={lead} />
            {lead.neighborhood && (lead.neighborhood.city || lead.neighborhood.suburb) && (
              <p className="mt-3 text-sm text-slate-600">{[lead.neighborhood.suburb, lead.neighborhood.city, lead.neighborhood.county, lead.neighborhood.state, lead.neighborhood.postcode].filter(Boolean).join(' · ')}</p>
            )}
          </section>

          {lead.outreach?.length > 0 && (
            <section className="card p-5">
              <p className="eyebrow mb-3">Outreach history</p>
              <ul className="space-y-3">
                {lead.outreach.slice().reverse().map((o) => (
                  <li key={o._id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold capitalize text-slate-700">{o.kind.replace('_', ' ')}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${o.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : o.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{o.subject}</p>
                    <p className="mt-1 text-xs text-slate-400">{dateTime(o.sent_at)} · {o.sent_by}{o.error ? ` · ${o.error}` : ''}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <p className="eyebrow mb-3">Activity & audit trail</p>
            {can('leads.notes') && (
              <form onSubmit={addNote} className="mb-4 flex gap-2">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
                <button className="btn-secondary" disabled={!note.trim() || busy === 'note'}>Add</button>
              </form>
            )}
            <ol className="relative space-y-4 border-l border-line pl-5">
              {timeline.map((ev) => {
                const Icon = TIMELINE_ICON[ev.type] || Clock;
                return (
                  <li key={ev._id} className="relative">
                    <span className={`absolute -left-[29px] flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-white ${ev.type === 'error' || ev.type === 'stale_flag' ? 'bg-red-100 text-red-600' : ev.type === 'override' ? 'bg-ember-100 text-ember-700' : 'bg-ink-50 text-ink-600'}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <p className="text-sm text-slate-700">{ev.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{ev.actor} · {dateTime(ev.at)}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>

      <ApproveModal lead={lead} open={modal === 'approve'} onClose={() => setModal(null)} onDone={update} />
      <EmailModal lead={lead} open={modal === 'email'} onClose={() => setModal(null)} onDone={update} />
      <StatusModal lead={lead} open={modal === 'status'} onClose={() => setModal(null)} onDone={update} />
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit lead" width="max-w-2xl">
        <LeadForm initial={leadToForm(lead)} onSubmit={saveEdit} busy={busy === 'edit'} onCancel={() => setModal(null)} submitLabel="Save changes" compact />
        {['Inbound', 'Underwritten'].includes(lead.status) && <p className="mt-3 text-xs text-slate-400">Changing property details re-runs AI underwriting automatically.</p>}
      </Modal>
      <ConfirmModal open={modal === 'delete'} onClose={() => setModal(null)} onConfirm={remove} busy={busy === 'delete'} danger confirmLabel="Delete lead"
        title="Delete this lead?" body={`${lead.property_address} and its full audit trail will be permanently removed.`} />
    </div>
  );
}
