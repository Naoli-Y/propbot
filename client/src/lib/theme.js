import { useEffect, useState } from 'react';

const KEY = 'propbot_theme';
export const THEMES = ['light', 'dark', 'system'];

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && Boolean(media()?.matches));
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1315' : '#0f3d3e');
  return dark;
}

const listeners = new Set();

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: theme still applies for this visit */ }
  applyTheme(pref);
  listeners.forEach((fn) => fn(pref));
}

/** Current preference ('light' | 'dark' | 'system') and whether dark is active, kept in sync across components. */
export function useTheme() {
  const [pref, setPref] = useState(getThemePref);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const onChange = (p) => { setPref(p); setIsDark(document.documentElement.classList.contains('dark')); };
    listeners.add(onChange);
    const mq = media();
    const onSystem = () => { if (getThemePref() === 'system') { applyTheme('system'); onChange('system'); } };
    mq?.addEventListener?.('change', onSystem);
    return () => { listeners.delete(onChange); mq?.removeEventListener?.('change', onSystem); };
  }, []);

  return { pref, isDark, setTheme: setThemePref };
}
