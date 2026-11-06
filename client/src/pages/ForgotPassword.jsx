import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Spinner } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Enter the email address you sign in with.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(data.message);
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center animate-rise">
          <MailCheck className="mx-auto h-10 w-10 text-ink-500" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">{sent}</p>
          <p className="mt-4 text-xs text-slate-400">Didn’t get it? Check spam, or ask your administrator to send you a reset link from Settings → Team.</p>
          <Link to="/login" className="btn-secondary mt-6 w-full"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Forgot your password?</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your email and we’ll send you a link to set a new one.</p>
          <label className="mt-6 block"><span className="label">Email</span>
            <input className="input" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </label>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary mt-5 w-full py-2.5" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Send reset link</button>
          <Link to="/login" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}
