import { useEffect } from 'react';
import { Loader2, X, Flame, Clock } from 'lucide-react';
import { STATUS_STYLE, RESPONSE_STYLE } from '../lib/constants.js';

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-ink-500 ${className}`} />;
}

export function PageLoader() {
  return <div className="flex h-64 items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}

export function StatusPill({ status, size = 'md' }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Inbound;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-semibold ${s.pill} ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

/** Viability score badge — color bands match the server's hot/warm/cold priority bands. */
export function ScoreBadge({ score, size = 'md', threshold = 70 }) {
  if (score === null || score === undefined) {
    return <span className={`inline-flex items-center justify-center rounded-lg bg-slate-100 font-mono font-semibold text-slate-400 ${size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-7 w-9 text-xs' : 'h-9 w-11 text-sm'}`}>—</span>;
  }
  const tone = score >= threshold ? 'bg-ink-900 text-white dark:bg-ink-300 dark:text-ink-950' : score >= 45 ? 'bg-ember-100 text-ember-700' : 'bg-slate-100 text-slate-600';
  const dims = size === 'lg' ? 'h-16 w-16 text-2xl rounded-2xl' : size === 'sm' ? 'h-7 w-9 text-xs rounded-md' : 'h-9 w-11 text-sm rounded-lg';
  return (
    <span className={`relative inline-flex items-center justify-center font-mono font-semibold tabular-nums ${tone} ${dims}`} title={`Viability score ${score}/100`}>
      {score}
      {score >= threshold && size !== 'sm' && <Flame className="absolute -right-1.5 -top-1.5 h-4 w-4 fill-ember-400 text-ember-500" />}
    </span>
  );
}

export function StaleTag() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600"><Clock className="h-3 w-3" />Stale</span>;
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-50"><Icon className="h-6 w-6 text-ink-500" /></div>}
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function useEscape(onClose, open) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [onClose, open]);
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={`relative flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-lift animate-rise sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/30 animate-fade-in" onClick={onClose} />
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-paper shadow-lift animate-slide-in scrollbar-thin">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon className={`h-4 w-4 ${accent || 'text-slate-400'}`} />}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 sm:text-[28px]">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Field({ label, children, hint, error, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{confirmLabel}</button>
      </>}>
      <p className="text-sm text-slate-600">{body}</p>
    </Modal>
  );
}

export function ResponseTag({ response }) {
  if (!response?.status) return null;
  const r = RESPONSE_STYLE[response.status];
  if (!r) return null;
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${r.cls}`}>{r.label}</span>;
}
