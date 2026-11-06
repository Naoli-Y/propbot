import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Download, Plus, ChevronLeft, ChevronRight, Trash2, ArrowRightLeft, Inbox, X } from 'lucide-react';
import { api, downloadFile, errorMessage } from '../lib/api.js';
import { money, timeAgo } from '../lib/format.js';
import { ALL_STATUSES } from '../lib/constants.js';
import { PageHeader } from '../components/Layout.jsx';
import { ConfirmModal, Drawer, EmptyState, Modal, PageLoader, ScoreBadge, Spinner, StaleTag, StatusPill, ResponseTag } from '../components/ui.jsx';
import LeadDetail from '../components/LeadDetail.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FILTER_KEYS = ['q', 'status', 'priority', 'minScore', 'stale', 'response', 'source', 'sort', 'page'];

export default function Leads() {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(params.get('q') || '');
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('Dead');
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState(70);

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Number(filters.page) || 1;

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || undefined]));
      const { data: d } = await api.get('/leads', { params: { ...query, limit: 25 } });
      setData(d);
      setSelected(new Set());
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/leads/meta/statuses').then((r) => setThreshold(r.data.threshold)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (search !== (params.get('q') || '')) setFilter('q', search); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = data?.items.length > 0 && data.items.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(data.items.map((l) => l.id)));

  const exportCsv = async () => {
    try {
      const query = Object.fromEntries(FILTER_KEYS.filter((k) => k !== 'page').map((k) => [k, params.get(k) || undefined]));
      await downloadFile('/leads/export.csv', query, `propbot-leads-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const runBulk = async () => {
    setBusy(true);
    try {
      const ids = [...selected];
      if (bulk === 'delete') {
        const { data: r } = await api.post('/leads/bulk/delete', { ids });
        toast(`Deleted ${r.deleted} lead(s)`);
      } else {
        const { data: r } = await api.post('/leads/bulk/status', { ids, status: bulkStatus, reason: 'Bulk update from leads table' });
        const failed = r.results.filter((x) => !x.ok).length;
        toast(`Moved ${r.updated} lead(s)${failed ? `, ${failed} skipped (invalid transition)` : ''}`, failed ? 'info' : 'success');
      }
      setBulk(null);
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && params.get(k));

  return (
    <div>
      <PageHeader
        title="All leads"
        subtitle={data ? `${data.total} lead${data.total === 1 ? '' : 's'}${hasFilters ? ' matching filters' : ''}` : ' '}
        actions={<>
          <button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</button>
          {canWrite && <Link to="/leads/new" className="btn-primary"><Plus className="h-4 w-4" />New lead</Link>}
        </>}
      />

      <div className="card mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search address, seller, email, tag" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input lg:w-44" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">All stages</option>{ALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input lg:w-36" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority">
            <option value="">Any priority</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
          </select>
          <select className="input lg:w-36" value={filters.minScore} onChange={(e) => setFilter('minScore', e.target.value)} aria-label="Minimum score">
            <option value="">Any score</option><option value="40">40+</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option>
          </select>
          <select className="input lg:w-40" value={filters.response} onChange={(e) => setFilter('response', e.target.value)} aria-label="Seller response">
            <option value="">Any response</option><option value="pending">Awaiting seller</option><option value="accepted">Accepted</option><option value="countered">Countered</option><option value="declined">Declined</option>
          </select>
          <select className="input lg:w-40" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
            <option value="">Newest first</option><option value="oldest">Oldest first</option><option value="score">Highest score</option><option value="score_asc">Lowest score</option><option value="price">Highest price</option><option value="price_asc">Lowest price</option><option value="updated">Recently updated</option>
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-slate-600">
            <input type="checkbox" className="accent-ink-900" checked={filters.stale === 'true'} onChange={(e) => setFilter('stale', e.target.checked ? 'true' : '')} />Stale only
          </label>
        </div>
        {hasFilters && <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}><X className="h-3 w-3" />Clear filters</button>}
      </div>

      {canWrite && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm text-white animate-rise">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="flex-1" />
          <button className="btn-sm btn bg-white/10 hover:bg-white/20" onClick={() => setBulk('status')}><ArrowRightLeft className="h-3.5 w-3.5" />Move stage</button>
          <button className="btn-sm btn bg-white/10 hover:bg-red-500" onClick={() => setBulk('delete')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>
      )}

      {!data ? <PageLoader /> : data.items.length === 0 ? (
        <div className="card"><EmptyState icon={Inbox} title={hasFilters ? 'No matching leads' : 'No leads yet'} body={hasFilters ? 'Try widening your filters.' : 'Create a lead or import a CSV to get started.'} /></div>
      ) : (
        <div className={`card overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/70 text-left">
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {canWrite && <th className="w-10 px-4 py-3"><input type="checkbox" className="accent-ink-900" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>}
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Property</th>
                  <th className="px-3 py-3">Stage</th>
                  <th className="px-3 py-3 text-right">Asking</th>
                  <th className="px-3 py-3 text-right">Offer range</th>
                  <th className="px-3 py-3">Seller</th>
                  <th className="px-3 py-3">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((l) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(l.id)}>
                    {canWrite && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-ink-900" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label="Select lead" /></td>}
                    <td className="px-3 py-3"><ScoreBadge score={l.viability_score} size="sm" threshold={threshold} /></td>
                    <td className="max-w-xs px-3 py-3">
                      <p className="truncate font-semibold text-slate-800">{l.property_address}</p>
                      <p className="truncate text-xs text-slate-400">{[l.property_type, l.bedrooms && `${l.bedrooms} bd`, l.square_feet && `${l.square_feet} sqft`].filter(Boolean).join(' · ') || l.source}</p>
                    </td>
                    <td className="px-3 py-3"><div className="flex flex-wrap items-center gap-1.5"><StatusPill status={l.status} size="sm" />{l.is_stale && <StaleTag />}{l.seller_response?.status !== 'pending' && <ResponseTag response={l.seller_response} />}</div></td>
                    <td className="num px-3 py-3 text-right text-slate-600">{money(l.asking_price)}</td>
                    <td className="num px-3 py-3 text-right font-semibold text-slate-800">{l.estimated_offer_max != null ? `${money(l.estimated_offer_min, { compact: true })}–${money(l.estimated_offer_max, { compact: true })}` : '—'}</td>
                    <td className="px-3 py-3"><p className="truncate text-slate-700">{l.seller_name || '—'}</p><p className="truncate text-xs text-slate-400">{l.seller_timeline}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{timeAgo(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <ul className="divide-y divide-line md:hidden">
            {data.items.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3" onClick={() => setOpenId(l.id)}>
                {canWrite && <input type="checkbox" className="accent-ink-900" checked={selected.has(l.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(l.id)} aria-label="Select lead" />}
                <ScoreBadge score={l.viability_score} size="sm" threshold={threshold} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{l.property_address}</p>
                  <div className="mt-1 flex items-center gap-2"><StatusPill status={l.status} size="sm" /><span className="num text-xs text-slate-500">{money(l.estimated_offer_max, { compact: true })}</span></div>
                </div>
              </li>
            ))}
          </ul>
          {data.pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-slate-500">Page {page} of {data.pages}</span>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}><ChevronLeft className="h-4 w-4" />Prev</button>
                <button className="btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setFilter('page', String(page + 1))}>Next<ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)}>
        {openId && <LeadDetail id={openId} onClose={() => setOpenId(null)} onChanged={(l) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === l.id ? { ...x, ...l } : x)) })} onDeleted={() => { setOpenId(null); load(); }} />}
      </Drawer>

      <Modal open={bulk === 'status'} onClose={() => setBulk(null)} title={`Move ${selected.size} lead(s)`}
        footer={<><button className="btn-secondary" onClick={() => setBulk(null)}>Cancel</button><button className="btn-primary" onClick={runBulk} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Move</button></>}>
        <label className="label">New stage</label>
        <select className="input" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
          {ALL_STATUSES.filter((s) => s !== 'Outreach Sent').map((s) => <option key={s}>{s}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-400">Leads that can&apos;t legally move to this stage are skipped. Offers must be approved individually.</p>
      </Modal>
      <ConfirmModal open={bulk === 'delete'} onClose={() => setBulk(null)} onConfirm={runBulk} busy={busy} danger confirmLabel="Delete" title={`Delete ${selected.size} lead(s)?`} body="This permanently removes the selected leads and their audit history." />
    </div>
  );
}
