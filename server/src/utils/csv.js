// RFC 4180 compliant CSV parser (quoted fields, escaped quotes, CRLF, embedded newlines).
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], records: [] };
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const records = nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, records };
}

const esc = (v) => {
  if (v === undefined || v === null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  const head = columns.map((c) => esc(c.label || c.key)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}
