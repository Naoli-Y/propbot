import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { api, downloadFile, errorMessage } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import { Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

// Lightweight preview parser (the server does the authoritative parse).
function previewCsv(text, maxRows = 6) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  };
  return { headers: lines[0] ? split(lines[0]) : [], rows: lines.slice(1, maxRows + 1).map(split), total: Math.max(0, lines.length - 1) };
}

const REQUIRED_HINT = ['property_address', 'address'];

export default function ImportLeads() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [campaign, setCampaign] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [queue, setQueue] = useState(null);
  const [drag, setDrag] = useState(false);

  const pick = (f) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) { toast('Please choose a .csv file', 'error'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('File is larger than 5 MB', 'error'); return; }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(previewCsv(String(reader.result)));
    reader.readAsText(f);
  };

  useEffect(() => {
    if (!result?.imported) return undefined;
    const poll = setInterval(async () => {
      try {
        const { data } = await api.get('/leads/import/status');
        setQueue(data);
        if (!data.running && data.pending === 0) clearInterval(poll);
      } catch { clearInterval(poll); }
    }, 2000);
    return () => clearInterval(poll);
  }, [result]);

  const upload = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (campaign.trim()) form.append('campaign', campaign.trim());
      const { data } = await api.post('/leads/import', form);
      setResult(data);
      setQueue({ pending: data.imported, running: true });
      toast(data.message);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const hasAddress = preview?.headers.some((h) => REQUIRED_HINT.includes(h.trim().toLowerCase().replace(/\s+/g, '_')));
  const done = queue && !queue.running && queue.pending === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="CSV bulk import" subtitle="Upload batch lead lists for offline campaigns. Each row is normalized, geocoded and underwritten."
        actions={<button className="btn-secondary" onClick={() => downloadFile('/leads/import/template.csv', {}, 'propbot-import-template.csv').catch((e) => toast(errorMessage(e), 'error'))}><Download className="h-4 w-4" />Template</button>} />

      <div className="card p-5 sm:p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? 'border-ink-400 bg-ink-50' : 'border-slate-300 hover:border-ink-300 hover:bg-slate-50'}`}
        >
          <UploadCloud className="h-9 w-9 text-ink-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Drop a CSV here or click to browse</p>
          <p className="mt-1 text-xs text-slate-400">Up to 1,000 rows · 5 MB. Columns like address, price, condition, timeline, email are auto-detected.</p>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {file && preview && (
          <div className="mt-5 animate-rise">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-ink-500" />
                <span className="truncate text-sm font-semibold text-slate-700">{file.name}</span>
                <span className="text-xs text-slate-400">{preview.total} rows</span>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => { setFile(null); setPreview(null); setResult(null); }} aria-label="Remove file"><X className="h-4 w-4" /></button>
            </div>
            {!hasAddress && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />No &quot;property_address&quot; or &quot;address&quot; column detected — rows will fail validation.</p>}
            <div className="mt-3 overflow-x-auto rounded-lg border border-line scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="bg-slate-50"><tr>{preview.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-bold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((r, i) => <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="max-w-[220px] truncate whitespace-nowrap px-3 py-2 text-slate-600">{r[j]}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1"><span className="label">Campaign tag (optional)</span>
                <input className="input" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Probate list — Nov" />
              </label>
              <button className="btn-primary" onClick={upload} disabled={busy || !!result}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <UploadCloud className="h-4 w-4" />}Import {preview.total} rows</button>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="card mt-4 p-5 animate-rise">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[['Rows', result.totalRows], ['Imported', result.imported], ['Already existed', result.skippedExisting], ['Invalid', result.invalid]].map(([l, v]) => (
              <div key={l}><p className="eyebrow">{l}</p><p className="num mt-1 text-2xl font-semibold text-slate-900">{v}</p></div>
            ))}
          </div>
          {result.imported > 0 && (
            <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${done ? 'bg-emerald-50 text-emerald-800' : 'bg-ink-50 text-ink-800'}`}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              {done ? 'All imported leads have been underwritten.' : `Underwriting in progress… ${queue?.pending ?? result.imported} remaining (geocoding is rate-limited to 1 request/second).`}
              <Link to="/pipeline" className="ml-auto font-semibold underline">View pipeline</Link>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-4">
              <p className="label">Rows with problems</p>
              <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm scrollbar-thin">
                {result.errors.map((e) => <li key={e.row} className="flex gap-3 px-3 py-2"><span className="num w-14 shrink-0 text-slate-400">Row {e.row}</span><span className="text-red-600">{e.errors.join(', ')}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
