import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, Search } from 'lucide-react';
import { api, errorMessage } from '../../lib/api.js';
import PublicLayout from '../../components/PublicLayout.jsx';
import { Field, Spinner } from '../../components/ui.jsx';

export default function OfferLookup() {
  const [email, setEmail] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Enter the email you used when you sent us your property.'); return; }
    if (reference.trim().replace(/[^a-fA-F0-9]/g, '').length !== 8) { setError('Your reference number has 8 characters, like 7A9B0C1D. It’s in the confirmation email.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/portal/lookup', { email: email.trim(), reference: reference.trim() });
      setDone(data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        {done ? (
          <div className="card p-6 text-center animate-rise">
            <MailCheck className="mx-auto h-10 w-10 text-ink-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">Check your inbox</h1>
            <p className="mt-2 text-sm text-slate-500">{done}</p>
            <Link to="/sell" className="btn-secondary mt-6">Back to home</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
            <div>
              <Search className="h-7 w-7 text-ink-500" />
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">Find my offer</h1>
              <p className="mt-1 text-sm text-slate-500">Lost the link to your offer page? Enter your email and reference number and we’ll send it again.</p>
            </div>
            <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            <Field label="Reference number"><input className="input num uppercase" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="7A9B0C1D" maxLength={12} /></Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Email me my link</button>
            <p className="text-center text-xs text-slate-400">Haven’t sent us your property yet? <Link to="/sell" className="font-semibold text-ink-600 hover:underline">Get a cash offer</Link></p>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
