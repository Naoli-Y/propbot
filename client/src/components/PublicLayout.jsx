import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import ThemeToggle from './ThemeToggle.jsx';

let cachedCompany = null;

export function useCompany() {
  const [company, setCompany] = useState(cachedCompany || 'PropBot Home Buyers');
  useEffect(() => {
    if (cachedCompany) return;
    api.get('/public/config').then((r) => { cachedCompany = r.data.company; setCompany(r.data.company); }).catch(() => {});
  }, []);
  return company;
}

function Mark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#f6a23a"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></svg>
    </div>
  );
}

export default function PublicLayout({ children }) {
  const company = useCompany();
  useEffect(() => { document.title = `${company} · Sell your house for cash`; }, [company]);
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/sell" className="flex items-center gap-2.5">
            <Mark />
            <span className="hidden text-[15px] font-extrabold tracking-tight text-ink-900 min-[400px]:inline">{company}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-3">
            <Link to="/sell#how" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:text-ink-900 sm:block">How it works</Link>
            <Link to="/offer" className="rounded-lg px-3 py-2 text-slate-600 hover:text-ink-900">Track my offer</Link>
            <ThemeToggle />
            <Link to="/sell#get-offer" className="btn-accent hidden sm:inline-flex">Get my offer</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {company}. All offers are subject to a walkthrough and title review.</span>
          <Link to="/login" className="hover:text-slate-700">Team sign in</Link>
        </div>
      </footer>
    </div>
  );
}
