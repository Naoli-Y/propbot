import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../lib/theme.js';

const OPTIONS = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

/**
 * Three-way theme switch.
 * variant "sidebar" sits on the dark teal sidebar; "plain" sits on normal page surfaces.
 */
export default function ThemeToggle({ variant = 'plain', showLabels = false }) {
  const { pref, setTheme } = useTheme();
  const wrap = variant === 'sidebar' ? 'bg-white/5 ring-1 ring-white/10' : 'bg-slate-100 ring-1 ring-line';
  const idle = variant === 'sidebar' ? 'text-ink-200 hover:text-white' : 'text-slate-500 hover:text-slate-800';
  const active = variant === 'sidebar' ? 'bg-white/15 text-white' : 'bg-surface text-slate-900 shadow-card';
  return (
    <div role="radiogroup" aria-label="Color theme" className={`inline-flex items-center gap-0.5 rounded-lg p-0.5 ${wrap} ${showLabels ? 'w-full' : ''}`}>
      {OPTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={pref === key}
          title={`${label} theme`}
          onClick={() => setTheme(key)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${pref === key ? active : idle}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {showLabels && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
