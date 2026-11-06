import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Wallet, TrendingUp, Handshake, Send, CheckCircle2, Undo2, XCircle, ChevronDown, RefreshCw, Inbox, ArrowLeftRight, Bot, Cpu, MailWarning } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { money, timeAgo } from '../lib/format.js';
import { PageHeader } from '../components/Layout.jsx';
import { Drawer, EmptyState, Modal, PageLoader, ResponseTag, ScoreBadge, Spinner, StatCard, StaleTag, Field } from '../components/ui.jsx';
import LeadDetail from '../components/LeadDetail.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function DealCard({ lead, threshold, onApproved, onDecided, onOpen }) {
  const toast = useToast();
  const { can } = useAuth();
  const canApprove = can('offers.approve');
  const canDecide = can('offers.decide');
  const [offer, setOffer] = useState(String(lead.approved_offer || lead.estimated_offer_max || ''));
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState('');
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState('');

  const amount = Number(String(offer).replace(/[$,]/g, '')) || 0;
  const equity = lead.estimated_market_value && amount ? lead.estimated_market_value - amount : null;
  const profit = lead.after_repair_value && amount ? lead.after_repair_value - amount - (lead.estimated_repair_cost || 0) : null;
  const overMax = lead.estimated_offer_max && amount > lead.estimated_offer_max * 1.1;

  const approve = async () => {
    setBusy('approve');
    try {
      const { data } = await api.post(`/leads/${lead.id}/approve`, { offer: amount });
      toast(data.delivery?.status === 'simulated' ? `Approved ${money(amount)} — email simulated (SendGrid not configured)` : `Approved ${money(amount)} and emailed the seller`);
      onApproved(lead.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const decide = async () => {
    setBusy('decide');
    try {
      await api.post(`/leads/${lead.id}/decision`, { decision, reason });
      toast(decision === 'send_back' ? 'Sent back to the acquisition team' : 'Deal rejected');
      setDecision(null);
      onDecided(lead.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const reasoning = (lead.ai_reasoning || '').split('\n').filter(Boolean);

  return (
    <article className="card overflow-hidden animate-rise">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 gap-3.5">
          <ScoreBadge score={lead.viability_score} threshold={threshold} />
          <div className="min-w-0">
            <button onClick={() => onOpen(lead.id)} className="block truncate text-left text-base font-bold text-slate-900 hover:text-ink-600">{lead.property_address}</button>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{lead.seller_name || 'Unknown seller'}</span>
              {lead.seller_timeline && <span>Timeline: {lead.seller_timeline}</span>}
              <span>Waiting {timeAgo(lead.status_changed_at).replace(' ago', '')}</span>
              {lead.is_stale && <StaleTag />}
              <span className="inline-flex items-center gap-1">{lead.underwriting_engine === 'gemini' ? <Bot className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}{lead.ai_confidence || '—'} confidence</span>
              {!lead.seller_email && <span className="inline-flex items-center gap-1 font-semibold text-red-600"><MailWarning className="h-3 w-3" />No seller email</span>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              {[['Asking', lead.asking_price], ['Market value', lead.estimated_market_value], ['ARV', lead.after_repair_value], ['Repairs', lead.estimated_repair_cost], ['AI range', null]].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="num mt-0.5 text-sm font-semibold text-slate-700">{k === 'AI range' ? `${money(lead.estimated_offer_min, { compact: true })}–${money(lead.estimated_offer_max, { compact: true })}` : money(val)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="w-full shrink-0 rounded-xl bg-paper p-4 lg:w-72">
          <Field label="Offer to send" error={overMax ? 'More than 10% above the AI maximum' : null}>
            <input className="input num text-lg font-semibold" inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} disabled={!canApprove} />
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-slate-400">Instant equity</p><p className={`num font-semibold ${equity > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{equity == null ? '—' : money(equity, { compact: true })}</p></div>
            <div><p className="text-slate-400">Est. flip profit</p><p className={`num font-semibold ${profit > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{profit == null ? '—' : money(profit, { compact: true })}</p></div>
          </div>
          {(canApprove || canDecide) && (
            <div className="mt-4 space-y-2">
              {canApprove && <button className="btn-accent w-full" onClick={approve} disabled={busy === 'approve' || !amount || !lead.seller_email}>
                {busy === 'approve' ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}Approve & send
              </button>}
              {canDecide && <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary btn-sm" onClick={() => { setDecision('send_back'); setReason(''); }}><Undo2 className="h-3.5 w-3.5" />Send back</button>
                <button className="btn-danger btn-sm" onClick={() => { setDecision('reject'); setReason(''); }}><XCircle className="h-3.5 w-3.5" />Reject</button>
              </div>}
            </div>
          )}
        </div>
      </div>

      {(reasoning.length > 0 || lead.defects?.length > 0) && (
        <div className="border-t border-line">
          <button onClick={() => setExpanded((x) => !x)} className="flex w-full items-center justify-between px-5 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            <span>AI reasoning & {lead.defects?.length || 0} defects</span>
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
              <ol className="space-y-1.5 text-sm text-slate-600">{reasoning.map((l, i) => <li key={i} className="flex gap-2"><span className="num text-xs text-slate-400">{i + 1}.</span>{l.replace(/^\d+[.)]\s*/, '')}</li>)}</ol>
              <ul className="space-y-1.5 text-sm">{(lead.defects || []).map((d, i) => <li key={i} className="flex justify-between gap-3"><span className="text-slate-700">{d.item} <span className="text-xs uppercase text-slate-400">{d.severity}</span></span><span className="num text-slate-500">{money(d.estimated_repair_cost)}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}

      <Modal open={Boolean(decision)} onClose={() => setDecision(null)} title={decision === 'send_back' ? 'Send back for rework' : 'Reject this deal'}
        footer={<><button className="btn-secondary" onClick={() => setDecision(null)}>Cancel</button><button className={decision === 'reject' ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} onClick={decide} disabled={busy === 'decide' || !reason.trim()}>{busy === 'decide' && <Spinner className="h-4 w-4 text-white" />}{decision === 'send_back' ? 'Send back' : 'Reject deal'}</button></>}>
        <p className="mb-3 text-sm text-slate-500">{decision === 'send_back' ? 'The lead returns to “Offer Drafted” so the team can revise it.' : 'The lead moves to “Dead”. It can be revived later.'}</p>
        <Field label="Reason (required)"><textarea className="input min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={decision === 'send_back' ? 'Repair estimate looks low — get a contractor quote for the foundation.' : 'Margin too thin for this market.'} autoFocus /></Field>
      </Modal>
    </article>
  );
}

export default function InvestorDesk() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/stats/investor');
      setData(d);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const removeFromQueue = (id) => { setData((d) => ({ ...d, queue: d.queue.filter((l) => l.id !== id) })); setTimeout(load, 400); };

  if (!data) return <PageLoader />;
  const t = data.totals;

  return (
    <div>
      <PageHeader title="Investor desk" subtitle="Approve, adjust or reject offers before they go to sellers — and see how sellers respond."
        actions={<button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting your approval" value={t.pendingCount} icon={Landmark} accent="text-ember-500" sub={`${money(t.pendingValue, { compact: true })} in offers`} />
        <StatCard label="Equity in queue" value={money(t.pendingEquity, { compact: true })} icon={TrendingUp} sub="market value − offer" />
        <StatCard label="Approved this month" value={t.approvedThisMonth} icon={Wallet} sub={money(t.approvedValueThisMonth, { compact: true })} />
        <StatCard label="Seller acceptance" value={t.acceptanceRate == null ? '—' : `${t.acceptanceRate}%`} icon={Handshake} sub={`${t.accepted} accepted · ${t.countered} countered · ${t.declined} declined`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">Approval queue</h2>
          {data.queue.length === 0 ? (
            <div className="card"><EmptyState icon={Inbox} title="Nothing waiting for approval" body="Offers the team submits for approval will appear here." action={<Link to="/pipeline" className="btn-secondary">Open pipeline</Link>} /></div>
          ) : (
            <div className="space-y-4">
              {data.queue.map((l) => <DealCard key={l.id} lead={l} threshold={data.threshold} onApproved={removeFromQueue} onDecided={removeFromQueue} onOpen={setOpenId} />)}
            </div>
          )}
        </section>

        <aside>
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">Seller responses</h2>
          <div className="card divide-y divide-line">
            {data.responses.length === 0 ? <p className="p-5 text-sm text-slate-400">No seller has answered an offer yet. Responses from the seller portal show up here.</p> : data.responses.map((l) => (
              <button key={l.id} onClick={() => setOpenId(l.id)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <ResponseTag response={l.seller_response} />
                  <span className="text-xs text-slate-400">{timeAgo(l.seller_response.responded_at)}</span>
                </div>
                <p className="mt-1.5 truncate text-sm font-semibold text-slate-800">{l.property_address}</p>
                <p className="num mt-0.5 text-xs text-slate-500">
                  Offer {money(l.approved_offer)}
                  {l.seller_response.counter_offer && <> <ArrowLeftRight className="inline h-3 w-3" /> counter <span className="font-semibold text-ember-700">{money(l.seller_response.counter_offer)}</span></>}
                </p>
                {l.seller_response.message && <p className="mt-1 line-clamp-2 text-xs italic text-slate-500">“{l.seller_response.message}”</p>}
              </button>
            ))}
          </div>
          <div className="card mt-4 p-4 text-sm text-slate-600">
            <p className="flex items-center gap-2 font-semibold text-slate-800"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t.awaitingSeller} offer(s) waiting on sellers</p>
            <p className="mt-1 text-xs text-slate-500">To answer a counter-offer, open the lead, move it back to “Awaiting Approval” and approve a new amount — the seller gets a fresh offer link.</p>
          </div>
        </aside>
      </div>

      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)}>
        {openId && <LeadDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => load()} onDeleted={() => { setOpenId(null); load(); }} />}
      </Drawer>
    </div>
  );
}
