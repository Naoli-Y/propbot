import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(() => {});
let seq = 0;

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  error: <AlertTriangle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-ink-500" />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message, type = 'success', ms = 4500) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-lift animate-rise">
            {ICONS[t.type]}
            <p className="flex-1 text-sm text-slate-700">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
