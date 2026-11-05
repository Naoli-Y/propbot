import { useState } from 'react';
import { Field, Spinner } from './ui.jsx';
import { PROPERTY_TYPES, TIMELINE_OPTIONS } from '../lib/constants.js';

const EMPTY = {
  property_address: '', seller_name: '', seller_email: '', seller_phone: '', asking_price: '',
  property_condition: '', seller_timeline: '', property_type: '', bedrooms: '', bathrooms: '', square_feet: '', year_built: '',
};

export const leadToForm = (lead = {}) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, lead[k] ?? '']));

export function validateLeadForm(v) {
  const e = {};
  if (!v.property_address || v.property_address.trim().length < 5) e.property_address = 'Enter the full street address';
  if (v.seller_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.seller_email.trim())) e.seller_email = 'Invalid email address';
  if (v.asking_price !== '' && !(Number(String(v.asking_price).replace(/[$,]/g, '')) > 0)) e.asking_price = 'Must be a positive number';
  for (const k of ['bedrooms', 'bathrooms', 'square_feet', 'year_built']) if (v[k] !== '' && Number.isNaN(Number(v[k]))) e[k] = 'Must be a number';
  return e;
}

/** Converts form strings to an API payload; blank fields become null so edits can clear them. */
export function formToPayload(v, { keepBlank = false } = {}) {
  const out = {};
  for (const [k, raw] of Object.entries(v)) {
    const val = typeof raw === 'string' ? raw.trim() : raw;
    if (val === '' || val === null) { if (keepBlank) out[k] = null; continue; }
    out[k] = ['asking_price', 'bedrooms', 'bathrooms', 'square_feet', 'year_built'].includes(k) ? Number(String(val).replace(/[$,]/g, '')) : val;
  }
  return out;
}

export default function LeadForm({ initial, onSubmit, submitLabel = 'Save', busy, onCancel, compact }) {
  const [v, setV] = useState({ ...EMPTY, ...(initial || {}) });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const errs = validateLeadForm(v);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(v);
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-1">Property</legend>
        <Field label="Street address *" error={errors.property_address} hint="Street, city, state and ZIP give the best geocoding results">
          <input className="input" value={v.property_address} onChange={set('property_address')} placeholder="4521 Magnolia Ave, Memphis, TN 38117" autoFocus={!compact} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Asking price" error={errors.asking_price} className="col-span-2 sm:col-span-1">
            <input className="input num" inputMode="numeric" value={v.asking_price} onChange={set('asking_price')} placeholder="150000" />
          </Field>
          <Field label="Type" className="col-span-2 sm:col-span-1">
            <select className="input" value={v.property_type} onChange={set('property_type')}>
              <option value="">—</option>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Beds" error={errors.bedrooms}><input className="input num" inputMode="numeric" value={v.bedrooms} onChange={set('bedrooms')} /></Field>
          <Field label="Baths" error={errors.bathrooms}><input className="input num" inputMode="decimal" value={v.bathrooms} onChange={set('bathrooms')} /></Field>
          <Field label="Sq ft" error={errors.square_feet}><input className="input num" inputMode="numeric" value={v.square_feet} onChange={set('square_feet')} /></Field>
          <Field label="Year built" error={errors.year_built}><input className="input num" inputMode="numeric" value={v.year_built} onChange={set('year_built')} /></Field>
        </div>
        <Field label="Condition notes" hint="Free text from the seller — the AI extracts defects like roof, foundation or HVAC issues">
          <textarea className="input min-h-[110px]" value={v.property_condition} onChange={set('property_condition')} placeholder="Roof leaks over the garage, HVAC is 20 years old, kitchen is original from 1978…" />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-1">Seller</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={v.seller_name} onChange={set('seller_name')} autoComplete="off" /></Field>
          <Field label="Timeline">
            <input className="input" list="timeline-options" value={v.seller_timeline} onChange={set('seller_timeline')} placeholder="ASAP" />
            <datalist id="timeline-options">{TIMELINE_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Email" error={errors.seller_email} hint="Required to send offers"><input className="input" type="email" value={v.seller_email} onChange={set('seller_email')} autoComplete="off" /></Field>
          <Field label="Phone"><input className="input" type="tel" value={v.seller_phone} onChange={set('seller_phone')} autoComplete="off" /></Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{submitLabel}</button>
      </div>
    </form>
  );
}
