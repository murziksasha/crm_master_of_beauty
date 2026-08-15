'use client';

import { useEffect, useState } from 'react';

export function PwaRegister() {
  const [askNotify, setAskNotify] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      if (!(process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_PWA_DEV)) {
        void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      }
    }

    // Soft prompt for notifications after first CRM visit
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const key = 'mob_notify_prompted';
      if (!sessionStorage.getItem(key)) {
        const t = window.setTimeout(() => setAskNotify(true), 4000);
        return () => window.clearTimeout(t);
      }
    }
  }, []);

  async function enable() {
    sessionStorage.setItem('mob_notify_prompted', '1');
    setAskNotify(false);
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    sessionStorage.setItem('mob_notify_prompted', '1');
    setAskNotify(false);
  }

  if (!askNotify) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[90] max-w-sm rounded-xl border border-border bg-white p-4 shadow-lg">
      <div className="text-sm font-semibold">Сповіщення CRM</div>
      <p className="mt-1 text-xs text-ink-muted">
        Отримувати браузерні сповіщення про нові записи, коли вкладка згорнута?
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-primary flex-1 py-1.5 text-sm" onClick={() => void enable()}>
          Увімкнути
        </button>
        <button type="button" className="btn btn-ghost flex-1 py-1.5 text-sm" onClick={dismiss}>
          Пізніше
        </button>
      </div>
    </div>
  );
}
