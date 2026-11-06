import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Gauge, MapPin, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../lib/api.js';
import { Spinner } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-ink-800" />
        <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-ink-950" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#0f3d3e"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></svg>
          </div>
          <span className="text-lg font-extrabold">PropBot</span>
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow !text-ember-400">AI acquisition desk</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">Underwrite every seller lead in seconds, not days.</h1>
          <ul className="mt-8 space-y-4 text-sm text-ink-100">
            <li className="flex gap-3"><Gauge className="h-5 w-5 shrink-0 text-ember-400" />Gemini-powered viability scores and cash-offer ranges</li>
            <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-ember-400" />Address validation and neighborhood context via OpenStreetMap</li>
            <li className="flex gap-3"><Mail className="h-5 w-5 shrink-0 text-ember-400" />One-click approved offers sent through SendGrid</li>
          </ul>
        </div>
        <p className="relative text-xs text-ink-300">Inbound → Underwritten → Offer Drafted → Awaiting Approval → Outreach Sent</p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your acquisition team account.</p>
          <div className="mt-8 space-y-4">
            <label className="block"><span className="label">Email</span>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <label className="block"><span className="label">Password</span>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4 text-white" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
          <p className="mt-6 text-sm"><a href="/sell" className="font-semibold text-ink-600 hover:underline">Selling a house? Get a cash offer →</a></p>
          <p className="mt-3 text-xs text-slate-400">First run? The admin account comes from <code className="font-mono">ADMIN_EMAIL</code> / <code className="font-mono">ADMIN_PASSWORD</code> in the server&apos;s .env.</p>
        </form>
      </div>
    </div>
  );
}
