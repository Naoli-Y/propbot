import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Plus, Eye, EyeOff, Flame } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { money, timeAgo, shortAddress } from '../lib/format.js';
import { STAGES, STATUS_STYLE, STAGE_HINT, TRANSITIONS } from '../lib/constants.js';
import { PageHeader } from '../components/Layout.jsx';
import { Drawer, PageLoader, ScoreBadge, StaleTag, ResponseTag } from '../components/ui.jsx';
import LeadDetail from '../components/LeadDetail.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const REFRESH_MS = 15000;

function LeadCard({ lead, threshold, onOpen, draggable, onDragStart }) {
  const { street, rest } = shortAddress(lead.property_address);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => onOpen(lead.id)}
      className="group w-full rounded-xl border border-line bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-lift"
    >
      <div className="flex items-start gap-2.5">
        <ScoreBadge score={lead.viability_score} size="sm" threshold={threshold} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{street}</p>
          <p className="truncate text-xs text-slate-500">{rest || '—'}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Offer</p>
          <p className="num text-sm font-semibold text-slate-800">{lead.estimated_offer_max != null ? `${money(lead.estimated_offer_min, { compact: true })}–${money(lead.estimated_offer_max, { compact: true })}` : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ask</p>
          <p className="num text-sm text-slate-600">{money(lead.asking_price, { compact: true })}</p>
        </div>
      </div>
      {lead.seller_response?.status && lead.seller_response.status !== 'pending' && (
        <div className="mt-2 flex items-center gap-2"><ResponseTag response={lead.seller_response} />{lead.seller_response.counter_offer && <span className="num text-[11px] font-semibold text-ember-700">{money(lead.seller_response.counter_offer, { compact: true })}</span>}</div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-slate-400">
        <span className="truncate">{lead.seller_name || 'Unknown seller'}{lead.seller_timeline ? ` · ${lead.seller_timeline}` : ''}</span>
        {lead.is_stale ? <StaleTag /> : <span className="shrink-0">{timeAgo(lead.status_changed_at)}</span>}
      </div>
    </button>
  );
}

export default function Pipeline() {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [leads, setLeads] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [q, setQ] = useState('');
  const [hotOnly, setHotOnly] = useState(false);
  const [showDead, setShowDead] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const dragged = useRef(null);

  const load = useCallback(async (silent) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await api.get('/leads', { params: { view: 'board', limit: 500, sort: 'score' } });
      setLeads(data.items);
    } catch (err) {
      if (!silent) toast(errorMessage(err), 'error');
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    api.get('/leads/meta/statuses').then((r) => setThreshold(r.data.threshold)).catch(() => {});
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const columns = useMemo(() => {
    const stages = showDead ? [...STAGES, 'Dead'] : STAGES;
    const needle = q.trim().toLowerCase();
    const filtered = (leads || []).filter((l) =>
      (!hotOnly || (l.viability_score ?? 0) >= threshold) &&
      (!needle || `${l.property_address} ${l.seller_name || ''}`.toLowerCase().includes(needle)));
    return stages.map((s) => {
      const items = filtered.filter((l) => l.status === s);
      return { status: s, items, value: items.reduce((sum, l) => sum + (l.approved_offer || l.estimated_offer_max || 0), 0) };
    });
  }, [leads, q, hotOnly, showDead, threshold]);

  const onDragStart = (e, lead) => {
    dragged.current = lead;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
  };

  const canDrop = (status) => {
    const l = dragged.current;
    return l && l.status !== status && status !== 'Outreach Sent' && TRANSITIONS[l.status]?.includes(status);
  };

  const onDrop = async (status) => {
    setDragOver(null);
    const lead = dragged.current;
    dragged.current = null;
    if (!lead || lead.status === status) return;
    if (status === 'Outreach Sent') { setOpenId(lead.id); toast('Review and approve the offer to send it', 'info'); return; }
    if (!TRANSITIONS[lead.status]?.includes(status)) { toast(`Can't move from ${lead.status} to ${status}`, 'error'); return; }
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status, status_changed_at: new Date().toISOString(), is_stale: false } : l)));
    try {
      const endpoint = status === 'Awaiting Approval' && lead.status === 'Offer Drafted' ? `/leads/${lead.id}/submit-for-approval` : `/leads/${lead.id}/status`;
      await api.post(endpoint, { status, reason: 'Moved on pipeline board' });
      toast(`Moved to ${status}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      load(true);
    }
  };

  const onChanged = useCallback((l) => setLeads((ls) => ls?.map((x) => (x.id === l.id ? { ...x, ...l } : x))), []);

  return (
    <div>
      <PageHeader
        title="Deal pipeline"
        subtitle={`Drag cards between stages. Auto-refreshes every ${REFRESH_MS / 1000}s.`}
        actions={<>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input w-56 pl-9" placeholder="Filter address or seller" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className={`btn ${hotOnly ? 'bg-ember-100 text-ember-700 ring-1 ring-ember-400' : 'btn-secondary'}`} onClick={() => setHotOnly((v) => !v)}><Flame className="h-4 w-4" />Hot only</button>
          <button className="btn-secondary" onClick={() => setShowDead((v) => !v)}>{showDead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showDead ? 'Hide' : 'Show'} dead</button>
          <button className="btn-secondary" onClick={() => load()} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          {canWrite && <Link to="/leads/new" className="btn-primary"><Plus className="h-4 w-4" />New lead</Link>}
        </>}
      />

      {!leads ? <PageLoader /> : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 scrollbar-thin sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max gap-4">
            {columns.map((col) => {
              const style = STATUS_STYLE[col.status];
              const active = dragOver === col.status;
              const droppable = active && canDrop(col.status);
              return (
                <section
                  key={col.status}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(col.status); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                  onDrop={(e) => { e.preventDefault(); onDrop(col.status); }}
                  className={`flex w-[280px] shrink-0 flex-col rounded-2xl border transition ${droppable ? 'border-ink-400 bg-ink-50' : active ? 'border-red-200 bg-red-50/40' : 'border-transparent bg-[#efede7]'}`}
                >
                  <header className="px-3 pb-2 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                        <h2 className="text-sm font-extrabold text-slate-800">{col.status}</h2>
                        <span className="num rounded-md bg-white px-1.5 text-xs font-semibold text-slate-500">{col.items.length}</span>
                      </div>
                      <span className="num text-xs font-semibold text-slate-500">{money(col.value, { compact: true })}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{STAGE_HINT[col.status]}</p>
                  </header>
                  <div className="flex max-h-[calc(100vh-240px)] min-h-[120px] flex-col gap-2.5 overflow-y-auto px-2.5 pb-3 scrollbar-thin">
                    {col.items.map((l) => <LeadCard key={l.id} lead={l} threshold={threshold} onOpen={setOpenId} draggable={canWrite} onDragStart={onDragStart} />)}
                    {!col.items.length && <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-8 text-xs text-slate-400">No leads</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)}>
        {openId && <LeadDetail id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} onDeleted={(id) => { setOpenId(null); setLeads((ls) => ls.filter((l) => l.id !== id)); }} />}
      </Drawer>
    </div>
  );
}
