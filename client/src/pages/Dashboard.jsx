import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Flame, Timer, Bot, Send, Wallet, AlertTriangle, RefreshCw, ArrowUpRight } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { money, number, timeAgo } from '../lib/format.js';
import { STATUS_STYLE, STAGES } from '../lib/constants.js';
import { PageHeader } from '../components/Layout.jsx';
import { PageLoader, ScoreBadge, StatCard, EmptyState } from '../components/ui.jsx';
import { VolumeChart, HBarList, ScoreHistogram } from '../components/Charts.jsx';
import { useToast } from '../context/ToastContext.jsx';

function LeadRow({ lead, threshold }) {
  return (
    <Link to={`/leads/${lead.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
      <ScoreBadge score={lead.viability_score} size="sm" threshold={threshold} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{lead.property_address}</p>
        <p className="text-xs text-slate-500">{lead.status} · {timeAgo(lead.status_changed_at)}</p>
      </div>
      <span className="num hidden text-sm font-semibold text-slate-700 sm:block">{money(lead.estimated_offer_max, { compact: true })}</span>
    </Link>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/stats/summary', { params: { days } });
      setData(r.data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoader />;
  const t = data.totals;
  const funnelMax = Math.max(1, ...data.byStatus.map((s) => s.count));

  return (
    <div>
      <PageHeader
        title="Acquisition overview"
        subtitle="Live view of inbound volume, underwriting speed and pipeline value."
        actions={<>
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          <button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </>}
      />

      {t.total === 0 ? (
        <div className="card"><EmptyState icon={Inbox} title="No leads yet" body="Submit a lead, import a CSV, or point a listing source at the webhook to get started." action={<Link to="/leads/new" className="btn-primary">Add first lead</Link>} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
            <StatCard label="Total leads" value={number(t.total)} icon={Inbox} sub={`${t.avgScore ?? '—'} avg score`} />
            <StatCard label="Hot leads" value={number(t.hot)} icon={Flame} accent="text-ember-500" sub={`score ≥ ${data.threshold}`} />
            <StatCard label="Time to underwrite" value={t.avgProcessingMs ? `${(t.avgProcessingMs / 1000).toFixed(1)}s` : '—'} icon={Timer} sub={t.under3sRate !== null ? `${t.under3sRate}% under 3s` : 'target < 3s'} />
            <StatCard label="Automation rate" value={t.automationRate !== null ? `${t.automationRate}%` : '—'} icon={Bot} sub="target > 80%" />
            <StatCard label="Offers sent" value={number(t.offersSent)} icon={Send} sub="Outreach Sent stage" />
            <StatCard label="Pipeline value" value={money(t.pipelineValue, { compact: true })} icon={Wallet} sub="drafted + pending + sent" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div><p className="eyebrow">Inbound volume</p><p className="mt-0.5 text-sm text-slate-500">Leads per day, hot leads highlighted</p></div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-200 dark:bg-ink-600" />All</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-900 dark:bg-ink-300" />Hot</span>
                </div>
              </div>
              <VolumeChart data={data.daily} />
            </section>

            <section className="card p-5">
              <p className="eyebrow mb-4">Pipeline funnel</p>
              <ul className="space-y-3">
                {data.byStatus.map((s) => (
                  <li key={s.status}>
                    <Link to={`/leads?status=${encodeURIComponent(s.status)}`} className="group block">
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-slate-600 group-hover:text-ink-700">{s.status}</span>
                        <span className="num text-slate-500">{s.count}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${STATUS_STYLE[s.status].bar}`} style={{ width: `${(s.count / funnelMax) * 100}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow">Hot leads awaiting action</p>
                <Link to="/pipeline" className="text-xs font-semibold text-ink-600 hover:underline">Board <ArrowUpRight className="inline h-3 w-3" /></Link>
              </div>
              {data.recentHot.length ? data.recentHot.map((l) => <LeadRow key={l.id} lead={l} threshold={data.threshold} />) : <p className="py-6 text-center text-sm text-slate-400">No hot leads waiting.</p>}
            </section>

            <section className="card p-5">
              <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /><p className="eyebrow">Stale hot leads</p></div>
              {data.stale.length ? data.stale.map((l) => <LeadRow key={l.id} lead={l} threshold={data.threshold} />) : <p className="py-6 text-center text-sm text-slate-400">Nothing stale. Nice work.</p>}
            </section>

            <section className="card space-y-6 p-5">
              <div><p className="eyebrow mb-4">Score distribution</p><ScoreHistogram buckets={data.scoreBuckets} threshold={data.threshold} /></div>
              <div><p className="eyebrow mb-3">Lead sources</p><HBarList items={data.sources.map((s) => ({ label: s.source, count: s.count }))} colorFor={() => 'bg-ink-400'} /></div>
            </section>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Underwriting engines: {data.engines.map((e) => `${e.engine === 'gemini' ? 'Gemini AI' : 'Rules fallback'} ${e.count}`).join(' · ') || '—'} · Stages: {STAGES.join(' → ')}
          </p>
        </>
      )}
    </div>
  );
}

