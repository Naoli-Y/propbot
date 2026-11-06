import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';

/** Centered card layout for sign-in side pages (forgot / reset password). */
export default function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-paper px-5 py-12">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <Link to="/login" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#f6a23a"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></svg>
        </div>
        <span className="text-lg font-extrabold tracking-tight text-ink-900">PropBot</span>
      </Link>
      <div className="card w-full max-w-sm p-6 sm:p-7">{children}</div>
    </div>
  );
}
