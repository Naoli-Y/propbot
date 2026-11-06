import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, Check } from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import AuthShell from '../components/AuthShell.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';

const RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Za-z]/.test(p) && /\d/.test(p), label: 'Letters and numbers' },
];

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [check, setCheck] = useState({ loading: true });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/auth/reset-password/${encodeURIComponent(token)}`)
      .then((r) => setCheck({ ok: true, email: r.data.email }))
      .catch((err) => setCheck({ ok: false, error: errorMessage(err, 'This reset link is invalid or has expired.') }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password });
      navigate('/login', { replace: true, state: { message: data.message } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (check.loading) return <AuthShell><PageLoader /></AuthShell>;

  if (!check.ok) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-ember-500" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Link expired</h1>
          <p className="mt-2 text-sm text-slate-500">{check.error} Reset links work once and expire after 60 minutes.</p>
          <Link to="/forgot-password" className="btn-primary mt-6 w-full">Request a new link</Link>
          <Link to="/login" className="mt-3 block text-sm font-semibold text-slate-500 hover:text-slate-800">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500">For <span className="font-semibold text-slate-700">{check.email}</span>. You’ll be signed out on other devices.</p>
        <label className="mt-6 block"><span className="label">New password</span>
          <div className="relative">
            <input className="input pr-10" type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <ul className="mt-2 space-y-1">
          {RULES.map((r) => (
            <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.test(password) ? 'text-emerald-700' : 'text-slate-400'}`}>
              <Check className="h-3.5 w-3.5" />{r.label}
            </li>
          ))}
        </ul>
        <label className="mt-4 block"><span className="label">Confirm new password</span>
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary mt-5 w-full py-2.5" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Change password</button>
      </form>
    </AuthShell>
  );
}
