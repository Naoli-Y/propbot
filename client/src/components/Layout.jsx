import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, Table2, PlusCircle, Upload, Settings, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/leads', label: 'All leads', icon: Table2 },
  { to: '/leads/new', label: 'New lead', icon: PlusCircle, write: true },
  { to: '/import', label: 'CSV import', icon: Upload, write: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ember-400">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#0f3d3e"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight text-white">PropBot</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">Acquisition desk</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }) {
  const { canWrite } = useAuth();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.write || canWrite).map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end ?? to === '/leads'} onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white/10 text-white' : 'text-ink-200 hover:bg-white/5 hover:text-white'}`}>
          <Icon className="h-[18px] w-[18px]" />{label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-white">{user?.name?.[0]?.toUpperCase() || '?'}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
        <div className="truncate text-xs capitalize text-ink-300">{user?.role}</div>
      </div>
      <button onClick={() => { logout(); navigate('/login'); }} className="rounded-md p-1.5 text-ink-300 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between bg-ink-900 p-4 lg:flex">
        <div className="space-y-8"><div className="px-1 pt-1"><Brand /></div><NavItems /></div>
        <UserBox />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink-900 px-4 lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-100 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-ink-900 p-4 animate-rise">
            <div className="space-y-6">
              <div className="flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)} className="p-1.5 text-ink-200" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
            <UserBox />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
