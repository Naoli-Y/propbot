import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Timer, Bot, Cpu, ArrowRight, Plus, MapPin } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { money } from '../lib/format.js';
import { PageHeader } from '../components/Layout.jsx';
import LeadForm, { formToPayload } from '../components/LeadForm.jsx';
import { ScoreBadge, StatusPill } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function NewLead() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const submit = async (values) => {
    setBusy(true);
    const started = performance.now();
    try {
      const { data } = await api.post('/leads', formToPayload(values));
      setResult({ ...data, roundTripMs: Math.round(performance.now() - started) });
      toast(data.duplicate ? 'This lead already exists' : `Lead underwritten — score ${data.lead.viability_score}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const lead = result?.lead;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New seller lead" subtitle="Submitting runs geocoding and AI underwriting instantly." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card p-5 sm:p-6">
          <LeadForm key={formKey} onSubmit={submit} busy={busy} submitLabel={busy ? 'Underwriting…' : 'Submit & underwrite'} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {!lead ? (
            <div className="card p-5">
              <p className="eyebrow mb-3">What happens next</p>
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3"><MapPin className="h-4 w-4 shrink-0 text-ink-500" />Address is validated and geocoded with OpenStreetMap.</li>
                <li className="flex gap-3"><Bot className="h-4 w-4 shrink-0 text-ink-500" />Gemini extracts defects, estimates value and computes a 0–100 viability score.</li>
                <li className="flex gap-3"><Timer className="h-4 w-4 shrink-0 text-ink-500" />Scores of 70+ go straight to <strong>Offer Drafted</strong> with a cash offer range.</li>
              </ol>
            </div>
          ) : (
            <div className="card overflow-hidden animate-rise">
              <div className="bg-ink-900 p-5 text-white">
                <div className="flex items-center gap-3">
                  <ScoreBadge score={lead.viability_score} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{lead.property_address}</p>
                    <div className="mt-1.5"><StatusPill status={lead.status} size="sm" /></div>
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-200">Suggested cash offer</p>
                <p className="num text-2xl font-semibold">{lead.estimated_offer_max != null ? `${money(lead.estimated_offer_min, { compact: true })} – ${money(lead.estimated_offer_max, { compact: true })}` : '—'}</p>
              </div>
              <div className="space-y-2 p-5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Engine</span><span className="flex items-center gap-1.5 font-semibold">{lead.underwriting_engine === 'gemini' ? <><Bot className="h-3.5 w-3.5" />Gemini AI</> : <><Cpu className="h-3.5 w-3.5" />Rules engine</>}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Server processing</span><span className="num font-semibold">{((lead.processing_ms || 0) / 1000).toFixed(2)}s</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Round trip</span><span className="num font-semibold">{(result.roundTripMs / 1000).toFixed(2)}s</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Geocoding</span><span className="font-semibold capitalize">{lead.geocode_status.replace('_', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Defects found</span><span className="num font-semibold">{lead.defects?.length || 0}</span></div>
                <div className="flex gap-2 pt-3">
                  <Link to={`/leads/${lead.id}`} className="btn-primary flex-1">Open lead <ArrowRight className="h-4 w-4" /></Link>
                  <button className="btn-secondary" onClick={() => { setResult(null); setFormKey((k) => k + 1); }}><Plus className="h-4 w-4" />Another</button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
