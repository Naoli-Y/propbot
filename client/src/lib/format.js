export const money = (n, { compact = false } = {}) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact && Math.abs(n) >= 1000 ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(n);
};

export const number = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US').format(n));

export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const date = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export function timeAgo(d) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return date(d);
}

export const shortAddress = (a = '') => {
  const parts = a.split(',');
  return { street: parts[0]?.trim() || a, rest: parts.slice(1).join(',').trim() };
};
