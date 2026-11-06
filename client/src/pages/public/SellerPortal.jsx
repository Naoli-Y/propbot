import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Check, CheckCircle2, XCircle, ArrowLeftRight, Home, PartyPopper, Clock, AlertTriangle, Copy } from 'lucide-react';
import { api, errorMessage } from '../../lib/api.js';
import { money, date } from '../../lib/format.js';
import PublicLayout from '../../components/PublicLayout.jsx';
import { PageLoader, Spinner, Field } from '../../components/ui.jsx';

function Stepper({ steps }) {
  return (
    <ol className="flex items-center">
      {steps.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'bg-ink-900 text-white' : 'border-2 border-slate-300 bg-white text-slate-400'}`}>
              {s.done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`whitespace-nowrap text-[11px] font-semibold sm:text-xs ${s.done ? 'text-ink-900' : 'text-slate-400'}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`mx-1 mb-5 h-0.5 flex-1 sm:mx-2 ${steps[i + 1].done ? 'bg-ink-900' : 'bg-slate-200'}`} />}
        </li>
      ))}
    </ol>
  );
}

const STAGE_ICON = { received: Clock, review: Clock, offer_ready: Home, countered: ArrowLeftRight, accepted: PartyPopper, declined: XCircle, closed: XCircle };

export default function SellerPortal() {
  const { token } = useParams();
  const location = useLocation();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // accept | decline | counter
  const [counter, setCounter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const justSubmitted = location.state?.justSubmitted;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/portal/${token}`);
      setView(data);
    } catch (err) {
      setError(errorMessage(err, 'This link is invalid or has expired.'));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Refresh while the team is still reviewing, so the offer appears without a reload.
  useEffect(() => {
    if (!view || !['received', 'review'].includes(view.stage)) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(t);
  }, [view, load]);

  const respond = async () => {
    setFormError('');
    if (mode === 'counter' && !(Number(String(counter).replace(/[$,]/g, '')) >= 1000)) { setFormError('Enter the price you would accept.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/portal/${token}/respond`, {
        action: mode,
        counter_offer: mode === 'counter' ? Number(String(counter).replace(/[$,]/g, '')) : undefined,
        message: message.trim() || undefined,
      });
      setView(data);
      setMode(null);
      setCounter('');
      setMessage('');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (error) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-ember-500" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">We couldn’t open this page</h1>
          <p className="mt-2 text-slate-500">{error} You can request a new link with your email and reference number.</p>
          <Link to="/offer" className="btn-primary mt-6">Find my offer</Link>
        </div>
      </PublicLayout>
    );
  }
  if (!view) return <PublicLayout><PageLoader /></PublicLayout>;

  const Icon = STAGE_ICON[view.stage] || Clock;
  const tone = view.stage === 'accepted' ? 'bg-emerald-50 text-emerald-800' : ['declined', 'closed'].includes(view.stage) ? 'bg-slate-100 text-slate-700' : view.offer ? 'bg-ember-50 text-ember-700' : 'bg-ink-50 text-ink-800';

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {justSubmitted && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 animate-rise">
            <p className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Thanks{view.seller_first_name ? `, ${view.seller_first_name}` : ''}! We received your property.</p>
            <p className="mt-1 text-sm text-emerald-800/80">Bookmark this page — it’s your private link to see and answer your offer. We also emailed it to you.</p>
            <button onClick={copyLink} className="btn-secondary btn-sm mt-3">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Your property</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{view.property.address}</h1>
          </div>
          <p className="text-sm text-slate-500">Reference <span className="num font-semibold text-slate-700">{view.reference}</span> · sent {date(view.submitted_at)}</p>
        </div>

        <div className="card mt-6 p-5 sm:p-6"><Stepper steps={view.steps} /></div>

        <div className={`mt-4 flex gap-3 rounded-2xl p-5 ${tone}`}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">{view.stage_title}</p><p className="mt-0.5 text-sm opacity-90">{view.stage_body}</p></div>
        </div>

        {view.offer && (
          <section className="card mt-4 overflow-hidden">
            <div className="bg-ink-900 px-5 py-6 text-white sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-200">Our all-cash offer</p>
              <p className="num mt-1 text-4xl font-semibold sm:text-5xl">{money(view.offer.amount)}</p>
              <p className="mt-1 text-sm text-ink-200">Sent {date(view.offer.sent_at)}</p>
            </div>
            <ul className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-7">
              {view.offer.terms.map((t) => <li key={t} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{t}</li>)}
            </ul>

            {view.response && (
              <div className="border-t border-line px-5 py-4 text-sm sm:px-7">
                <p className="font-semibold text-slate-800">
                  Your response: <span className="capitalize">{view.response.status}</span>
                  {view.response.counter_offer && <> at <span className="num">{money(view.response.counter_offer)}</span></>}
                  <span className="font-normal text-slate-400"> · {date(view.response.responded_at)}</span>
                </p>
                {view.response.message && <p className="mt-1 text-slate-500">“{view.response.message}”</p>}
              </div>
            )}

            {view.can_respond && (
              <div className="border-t border-line px-5 py-5 sm:px-7">
                {!mode ? (
                  <>
                    <p className="mb-3 text-sm font-semibold text-slate-700">{view.stage === 'countered' ? 'Changed your mind? You can still respond:' : 'How would you like to proceed?'}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button className="btn bg-emerald-600 py-3 text-white hover:bg-emerald-700" onClick={() => setMode('accept')}><CheckCircle2 className="h-4 w-4" />Accept offer</button>
                      <button className="btn-secondary py-3" onClick={() => setMode('counter')}><ArrowLeftRight className="h-4 w-4" />Make a counter-offer</button>
                      <button className="btn-secondary py-3 text-slate-500" onClick={() => setMode('decline')}><XCircle className="h-4 w-4" />Decline</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 animate-rise">
                    <p className="font-bold text-slate-800">
                      {mode === 'accept' && `Accept our offer of ${money(view.offer.amount)}?`}
                      {mode === 'counter' && 'What price would work for you?'}
                      {mode === 'decline' && 'Decline this offer?'}
                    </p>
                    {mode === 'counter' && (
                      <Field label="Your price (USD)">
                        <input className="input num text-lg font-semibold" inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value)} placeholder={String(Math.round(view.offer.amount * 1.1 / 1000) * 1000)} autoFocus />
                      </Field>
                    )}
                    <Field label={mode === 'decline' ? 'Mind telling us why? (optional)' : 'Message for our team (optional)'}>
                      <textarea className="input min-h-[80px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === 'accept' ? 'Best days for a walkthrough…' : ''} />
                    </Field>
                    {mode === 'accept' && <p className="text-xs text-slate-500">Accepting doesn’t sign anything yet. We’ll call you to schedule a quick walkthrough and send the purchase agreement.</p>}
                    {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button className={mode === 'accept' ? 'btn bg-emerald-600 text-white hover:bg-emerald-700' : mode === 'decline' ? 'btn bg-slate-700 text-white hover:bg-slate-800' : 'btn-accent'} onClick={respond} disabled={busy}>
                        {busy && <Spinner className="h-4 w-4 text-white" />}
                        {mode === 'accept' ? 'Yes, accept' : mode === 'counter' ? 'Send counter-offer' : 'Decline offer'}
                      </button>
                      <button className="btn-ghost" onClick={() => { setMode(null); setFormError(''); }} disabled={busy}>Back</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="card mt-4 p-5 sm:p-6">
          <p className="eyebrow mb-3">Details you sent</p>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[['Type', view.property.property_type], ['Bedrooms', view.property.bedrooms], ['Bathrooms', view.property.bathrooms], ['Square feet', view.property.square_feet?.toLocaleString('en-US')]].map(([k, val]) => (
              <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="mt-0.5 font-semibold text-slate-700">{val ?? '—'}</dd></div>
            ))}
          </dl>
        </section>

        {view.history.length > 1 && (
          <section className="card mt-4 p-5 sm:p-6">
            <p className="eyebrow mb-3">Your responses</p>
            <ul className="space-y-2 text-sm">
              {view.history.slice().reverse().map((h, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
                  <span className="capitalize text-slate-700">{h.status}{h.counter_offer ? ` at ${money(h.counter_offer)}` : ''} <span className="text-slate-400">(offer {money(h.offer_amount)})</span></span>
                  <span className="text-slate-400">{date(h.responded_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">Questions? Just reply to any email from {view.company}. Keep this link private — anyone with it can see your offer.</p>
      </div>
    </PublicLayout>
  );
}
