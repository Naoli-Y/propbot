import { useState } from 'react';

/** Daily inbound volume: bars for total leads, darker overlay for hot leads. */
export function VolumeChart({ data = [], height = 180 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 100 / Math.max(1, data.length);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <div className="relative">
      <div className="flex">
        <div className="flex w-7 flex-col justify-between pb-5 pr-1 text-right font-mono text-[10px] text-slate-400" style={{ height }}>
          {[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative flex-1">
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: height - 20 }} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => <line key={t} x1="0" x2="100" y1={(height - 20) * (1 - t / max)} y2={(height - 20) * (1 - t / max)} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />)}
            {data.map((d, i) => {
              const h = ((height - 20) * d.count) / max;
              const hh = ((height - 20) * d.hot) / max;
              return (
                <g key={d.date} onMouseEnter={() => setHover(i)}>
                  <rect x={i * w} y={0} width={w} height={height - 20} fill="transparent" />
                  <rect x={i * w + w * 0.18} y={height - 20 - h} width={w * 0.64} height={h} rx="0.6" style={{ fill: hover === i ? 'var(--chart-bar-hover)' : 'var(--chart-bar)' }} />
                  <rect x={i * w + w * 0.18} y={height - 20 - hh} width={w * 0.64} height={hh} rx="0.6" style={{ fill: 'var(--chart-hot)' }} />
                </g>
              );
            })}
          </svg>
          <div className="flex justify-between pt-1.5 font-mono text-[10px] text-slate-400">
            <span>{data[0]?.date.slice(5)}</span>
            <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
            <span>{data.at(-1)?.date.slice(5)}</span>
          </div>
          {hover !== null && data[hover] && (
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-950 ring-1 ring-white/10 px-2.5 py-1.5 text-xs text-white shadow-lift" style={{ left: `${(hover + 0.5) * w}%` }}>
              <div className="font-mono text-[10px] text-ink-200">{data[hover].date}</div>
              <div>{data[hover].count} leads · <span className="text-ember-400">{data[hover].hot} hot</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars for categorical breakdowns. */
export function HBarList({ items = [], valueKey = 'count', labelKey = 'label', colorFor, format = (v) => v }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it[labelKey]}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-600">{it[labelKey]}</span>
            <span className="font-mono tabular-nums text-slate-500">{format(it[valueKey])}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${colorFor ? colorFor(it) : 'bg-ink-500'}`} style={{ width: `${(it[valueKey] / max) * 100}%`, transition: 'width 400ms ease' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Score distribution histogram. */
export function ScoreHistogram({ buckets = [], threshold = 70 }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {buckets.map((b) => {
        const lower = parseInt(b.label, 10);
        const hot = lower >= threshold;
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-[11px] tabular-nums text-slate-500">{b.count}</span>
            <div className={`w-full rounded-t-md ${hot ? 'bg-ink-900 dark:bg-ink-300' : lower >= 40 ? 'bg-ember-400' : 'bg-slate-300'}`} style={{ height: `${Math.max(4, (b.count / max) * 96)}px` }} />
            <span className="font-mono text-[10px] text-slate-400">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
