import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Banknote, CalendarCheck, Hammer, HandCoins, ShieldCheck, ClipboardList, Search, KeyRound, ChevronDown, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api.js';
import { TIMELINE_OPTIONS, PROPERTY_TYPES } from '../../lib/constants.js';
import PublicLayout, { useCompany } from '../../components/PublicLayout.jsx';
import { Field, Spinner } from '../../components/ui.jsx';

const EMPTY = {
  property_address: '', property_type: '', bedrooms: '', bathrooms: '', square_feet: '', year_built: '',
  property_condition: '', seller_timeline: '', asking_price: '', seller_name: '', seller_email: '', seller_phone: '',
  consent: false, company_website: '',
};

const BENEFITS = [
  { icon: Hammer, title: 'Sell as-is', body: 'No repairs, cleaning or staging. Leave behind what you don’t want.' },
  { icon: HandCoins, title: 'No fees or commissions', body: 'The offer you accept is what you get. We cover standard closing costs.' },
  { icon: CalendarCheck, title: 'Close on your date', body: 'In as little as two weeks — or months from now if you need time.' },
  { icon: Banknote, title: 'All-cash, no financing', body: 'No waiting on bank approvals or buyers backing out at the last minute.' },
];

const STEPS = [
  { icon: ClipboardList, title: 'Tell us about the house', body: 'Two minutes: the address, its condition and when you want to move.' },
  { icon: Search, title: 'We review it', body: 'Our team looks at the property and the neighborhood — usually within one business day.' },
  { icon: Banknote, title: 'Get your cash offer', body: 'See it on your private offer page. Accept, decline or counter — no obligation.' },
  { icon: KeyRound, title: 'Close and get paid', body: 'Pick the closing date. We handle the paperwork with a local title company.' },
];

const FAQ = [
  ['Is there any obligation?', 'None. Our offer is free and you can decline it, or make a counter-offer, from your offer page.'],
  ['How do you decide the price?', 'We look at what similar homes nearby sell for, the repairs the house needs and the costs of buying, fixing and holding it.'],
  ['Do I need to make repairs first?', 'No. We buy houses in any condition — roof leaks, foundation problems, fire damage, outdated kitchens and more.'],
  ['What happens to my information?', 'We only use it to evaluate your property and contact you about it. We never sell your details.'],
];

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4 py-4 text-left">
        <span className="font-bold text-slate-800">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-slate-600 animate-fade-in">{a}</p>}
    </div>
  );
}

export default function SellLanding() {
  const company = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [location.hash]);

  const validate = () => {
    const e = {};
    if (v.property_address.trim().length < 8) e.property_address = 'Please enter the street, city, state and ZIP';
    if (!v.seller_name.trim()) e.seller_name = 'Your name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.seller_email.trim())) e.seller_email = 'Enter a valid email so we can send your offer';
    if (v.asking_price && !(Number(String(v.asking_price).replace(/[$,]/g, '')) > 0)) e.asking_price = 'Numbers only, e.g. 150000';
    if (!v.consent) e.consent = 'Please agree so we can contact you about your offer';
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== null));
      for (const k of ['bedrooms', 'bathrooms', 'square_feet', 'year_built', 'asking_price']) if (payload[k] !== undefined) payload[k] = Number(String(payload[k]).replace(/[$,]/g, ''));
      payload.consent = v.consent;
      const { data } = await api.post('/public/leads', payload);
      if (data.path) navigate(data.path, { state: { justSubmitted: true, reference: data.reference } });
    } catch (err) {
      setServerError(errorMessage(err, 'We could not submit your request. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      {/* Hero + form */}
      <section className="relative overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-ember-100/60 blur-3xl dark:bg-ember-500/10" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="lg:pt-6">
            <p className="eyebrow !text-ember-700">Cash home buyers</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink-900 sm:text-5xl">
              Sell your house as-is.<br />Get a fair cash offer in 24 hours.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              No repairs, no showings, no agent fees. Tell {company} about your property and we’ll send you a no-obligation offer you can review online.
            </p>
            <ul className="mt-8 grid max-w-lg gap-4 sm:grid-cols-2">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-card"><Icon className="h-[18px] w-[18px] text-ink-700" /></div>
                  <div><p className="text-sm font-bold text-slate-800">{title}</p><p className="mt-0.5 text-sm text-slate-500">{body}</p></div>
                </li>
              ))}
            </ul>
          </div>

          <form id="get-offer" onSubmit={submit} noValidate className="card scroll-mt-24 space-y-5 p-5 shadow-lift sm:p-7">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Get your free cash offer</h2>
              <p className="mt-1 text-sm text-slate-500">Takes about 2 minutes. No obligation.</p>
            </div>

            <Field label="Property address *" error={errors.property_address}>
              <input className="input" value={v.property_address} onChange={set('property_address')} placeholder="123 Main St, Springfield, IL 62701" autoComplete="street-address" />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Type" className="col-span-2">
                <select className="input" value={v.property_type} onChange={set('property_type')}>
                  <option value="">Select…</option>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Beds"><input className="input" inputMode="numeric" value={v.bedrooms} onChange={set('bedrooms')} /></Field>
              <Field label="Baths"><input className="input" inputMode="decimal" value={v.bathrooms} onChange={set('bathrooms')} /></Field>
            </div>
            <Field label="What condition is it in?" hint="Roof, plumbing, HVAC, kitchen… anything that needs work. Honest details get you a more accurate offer.">
              <textarea className="input min-h-[96px]" value={v.property_condition} onChange={set('property_condition')} placeholder="The roof leaks in one bedroom and the kitchen is original…" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="When do you want to sell?">
                <select className="input" value={v.seller_timeline} onChange={set('seller_timeline')}>
                  <option value="">Select…</option>{TIMELINE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Price in mind (optional)" error={errors.asking_price}>
                <input className="input" inputMode="numeric" value={v.asking_price} onChange={set('asking_price')} placeholder="$" />
              </Field>
            </div>
            <div className="grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <Field label="Your name *" error={errors.seller_name} className="sm:col-span-2"><input className="input" value={v.seller_name} onChange={set('seller_name')} autoComplete="name" /></Field>
              <Field label="Email *" error={errors.seller_email}><input className="input" type="email" value={v.seller_email} onChange={set('seller_email')} autoComplete="email" /></Field>
              <Field label="Phone"><input className="input" type="tel" value={v.seller_phone} onChange={set('seller_phone')} autoComplete="tel" /></Field>
            </div>
            {/* Honeypot — hidden from people, bots fill it in */}
            <input type="text" name="company_website" tabIndex={-1} autoComplete="off" value={v.company_website} onChange={set('company_website')} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" className="mt-0.5 accent-ink-900" checked={v.consent} onChange={set('consent')} />
              <span>I agree that {company} may contact me by email or phone about this property.</span>
            </label>
            {errors.consent && <p className="-mt-3 text-xs text-red-600">{errors.consent}</p>}
            {serverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
            <button className="btn-accent w-full py-3 text-base" disabled={busy}>
              {busy ? <><Spinner className="h-4 w-4 text-white" />Sending your details…</> : <>Get my cash offer <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />Your information is never sold or shared.</p>
          </form>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">From first message to cash in hand</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="relative rounded-2xl border border-line bg-paper p-5">
                <span className="num absolute right-4 top-4 text-3xl font-semibold text-slate-200">{String(i + 1).padStart(2, '0')}</span>
                <Icon className="h-6 w-6 text-ember-600" />
                <p className="mt-4 font-bold text-slate-800">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Compare + FAQ */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Why sellers choose us</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">Compared with listing</h2>
          <div className="card mt-6 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3" /><th className="px-4 py-3 text-ink-900">{company}</th><th className="px-4 py-3">Traditional sale</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[['Repairs needed', 'None', 'Often'], ['Agent commission', '0%', 'Around 5–6%'], ['Showings', 'None', 'Many'], ['Time to close', '2–4 weeks', '2–4 months'], ['Financing risk', 'None — cash', 'Buyer loan can fall through']].map(([k, a, b]) => (
                  <tr key={k}><td className="px-4 py-3 font-semibold text-slate-600">{k}</td><td className="px-4 py-3 font-semibold text-ink-900"><CheckCircle2 className="mr-1.5 inline h-4 w-4 text-emerald-500" />{a}</td><td className="px-4 py-3 text-slate-500">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="eyebrow">Questions</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">Frequently asked</h2>
          <div className="mt-4">{FAQ.map(([q, a]) => <Faq key={q} q={q} a={a} />)}</div>
        </div>
      </section>

      <section className="bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">Ready to see what your house is worth to us?</h2>
            <p className="mt-1 text-ink-200">Free, fast and with no obligation.</p>
          </div>
          <a href="#get-offer" onClick={(e) => { e.preventDefault(); document.getElementById('get-offer')?.scrollIntoView({ behavior: 'smooth' }); }} className="btn-accent px-5 py-3 text-base">Get my offer <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>
    </PublicLayout>
  );
}
