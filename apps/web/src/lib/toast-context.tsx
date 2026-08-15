'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type ToastItem = {
  id: string;
  title: string;
  message?: string;
  kind: ToastKind;
};

type ToastContextValue = {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'> & { id?: string }) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<ToastItem, 'id'> & { id?: string }) => {
      const id = t.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-4), { id, title: t.title, message: t.message, kind: t.kind }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${
              t.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                : t.kind === 'warning'
                  ? 'border-amber-200 bg-amber-50/95 text-amber-900'
                  : t.kind === 'error'
                    ? 'border-rose-200 bg-rose-50/95 text-rose-900'
                    : 'border-border bg-white/95 text-ink'
            }`}
            role="status"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message ? <div className="mt-0.5 text-xs opacity-80">{t.message}</div> : null}
              </div>
              <button
                type="button"
                className="text-xs opacity-60 hover:opacity-100"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
