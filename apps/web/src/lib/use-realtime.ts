'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiBase, getBranchId } from './api';
import { useToast } from './toast-context';

type RealtimePayload = {
  type?: string;
  message?: string;
  clientName?: string;
  staffName?: string;
  status?: string;
  startAt?: string;
};

/**
 * Subscribe to SSE realtime stream; invalidate queries + toast.
 */
export function useRealtime(enabled = true) {
  const qc = useQueryClient();
  const toast = useToast();
  const esRef = useRef<EventSource | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (typeof EventSource === 'undefined') return;

    const token = localStorage.getItem('accessToken');
    const base = getApiBase();
    const branchId = getBranchId();
    const url = new URL(`${base}/realtime/stream`);
    if (branchId) url.searchParams.set('branchId', branchId);
    if (token) url.searchParams.set('access_token', token);

    let es: EventSource;
    try {
      es = new EventSource(url.toString(), { withCredentials: true } as EventSourceInit);
    } catch {
      return;
    }
    esRef.current = es;

    es.onmessage = (ev) => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
      void qc.invalidateQueries({ queryKey: ['cash-today'] });

      try {
        const raw = JSON.parse(ev.data) as {
          type?: string;
          payload?: RealtimePayload;
        };
        const p = raw.payload || {};
        const type = raw.type || '';
        const title =
          type === 'appointment.created'
            ? 'Новий запис'
            : type === 'appointment.status'
              ? 'Зміна статусу'
              : type === 'appointment.rescheduled'
                ? 'Запис перенесено'
                : null;
        const message =
          p.message ||
          p.clientName ||
          (type === 'appointment.created' ? 'Оновіть календар' : String(p.status || ''));

        if (title) {
          const kind =
            type === 'appointment.created'
              ? 'success'
              : p.status === 'CANCELLED' || p.status === 'NO_SHOW'
                ? 'warning'
                : 'info';
          toastRef.current.push({ kind, title, message });

          // Browser / PWA notification when tab is in background
          if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted' &&
            document.visibilityState === 'hidden'
          ) {
            try {
              new Notification(title, {
                body: message,
                icon: '/icon.svg',
                tag: type + (p.startAt || ''),
              });
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore parse */
      }
    };

    es.onerror = () => {
      /* browser retries */
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled, qc]);
}
