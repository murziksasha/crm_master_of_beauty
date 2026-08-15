'use client';

import { useMemo, useRef, useState } from 'react';
import {
  addMinutes,
  differenceInMinutes,
  format,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';
import { formatTime, statusColors, statusLabels } from '@/lib/utils';

type Staff = { id: string; displayName: string; color: string };
type Appt = {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: string;
  client: { firstName: string; lastName?: string | null };
  services: { nameSnapshot: string }[];
  sale?: { id: string } | null;
  room?: { id: string; name: string } | null;
  depositPaidAt?: string | null;
  depositAmount?: number | string | null;
};

const HOUR_START = 8;
const HOUR_END = 21;
const PX_PER_MIN = 1.2;

type Props = {
  day: string;
  staff: Staff[];
  appointments: Appt[];
  onReschedule: (id: string, startAt: string, staffId: string) => void;
  onResize?: (id: string, endAt: string) => void;
  onSelect?: (a: Appt) => void;
  renderActions?: (a: Appt) => React.ReactNode;
  readOnly?: boolean;
};

function dayBounds(day: string) {
  const base = startOfDay(parseISO(day));
  const start = setMinutes(setHours(base, HOUR_START), 0);
  const end = setMinutes(setHours(base, HOUR_END), 0);
  return { start, end, totalMin: differenceInMinutes(end, start) };
}

export function ResourceDayCalendar({
  day,
  staff,
  appointments,
  onReschedule,
  onResize,
  onSelect,
  renderActions,
  readOnly,
}: Props) {
  const { start, totalMin } = useMemo(() => dayBounds(day), [day]);
  const height = totalMin * PX_PER_MIN;
  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
    [],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  /** Live end ISO while resizing */
  const [resizePreview, setResizePreview] = useState<Record<string, string>>({});
  const resizeRef = useRef<{
    id: string;
    startY: number;
    origEnd: Date;
    apptStart: Date;
  } | null>(null);

  function topFor(iso: string) {
    const mins = differenceInMinutes(new Date(iso), start);
    return Math.max(0, Math.min(totalMin, mins)) * PX_PER_MIN;
  }

  function heightFor(startIso: string, endIso: string) {
    const mins = Math.max(15, differenceInMinutes(new Date(endIso), new Date(startIso)));
    return mins * PX_PER_MIN;
  }

  function snapMinutes(clientY: number, columnEl: HTMLElement) {
    const rect = columnEl.getBoundingClientRect();
    const y = clientY - rect.top + columnEl.scrollTop;
    const rawMin = y / PX_PER_MIN;
    const snapped = Math.round(rawMin / 15) * 15;
    return Math.max(0, Math.min(totalMin - 15, snapped));
  }

  function handleDrop(e: React.DragEvent, staffId: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/appointment-id') || dragId;
    if (!id || readOnly) return;
    const col = e.currentTarget as HTMLElement;
    const offsetMin = snapMinutes(e.clientY, col);
    const newStart = addMinutes(start, offsetMin);
    onReschedule(id, newStart.toISOString(), staffId);
    setDragId(null);
  }

  function onResizePointerDown(e: React.PointerEvent, a: Appt) {
    if (readOnly || !onResize) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      id: a.id,
      startY: e.clientY,
      origEnd: new Date(a.endAt),
      apptStart: new Date(a.startAt),
    };
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!resizeRef.current) return;
    const dy = e.clientY - resizeRef.current.startY;
    const dMin = Math.round(dy / PX_PER_MIN / 15) * 15;
    const nextEnd = addMinutes(resizeRef.current.origEnd, dMin);
    const minEnd = addMinutes(resizeRef.current.apptStart, 15);
    const end = nextEnd > minEnd ? nextEnd : minEnd;
    setResizePreview((p) => ({ ...p, [resizeRef.current!.id]: end.toISOString() }));
  }

  function onResizePointerUp(e: React.PointerEvent, a: Appt) {
    if (!resizeRef.current || !onResize) return;
    const dy = e.clientY - resizeRef.current.startY;
    const dMin = Math.round(dy / PX_PER_MIN / 15) * 15;
    const nextEnd = addMinutes(resizeRef.current.origEnd, dMin);
    const minEnd = addMinutes(new Date(a.startAt), 15);
    const end = nextEnd > minEnd ? nextEnd : minEnd;
    const id = resizeRef.current.id;
    resizeRef.current = null;
    setResizePreview((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    if (end.toISOString() !== a.endAt) {
      onResize(a.id, end.toISOString());
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-border bg-cream/60">
        <div className="w-14 shrink-0 border-r border-border px-1 py-2 text-center text-[10px] text-ink-muted">
          час
        </div>
        {staff.map((s) => (
          <div
            key={s.id}
            className="min-w-[140px] flex-1 border-r border-border px-2 py-2 text-center last:border-r-0"
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-sm font-semibold">{s.displayName}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex max-h-[70vh] overflow-auto">
        <div className="relative w-14 shrink-0 border-r border-border" style={{ height }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-1 text-[10px] text-ink-muted"
              style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN - 6 }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {staff.map((s) => {
          const colAppts = appointments.filter((a) => a.staffId === s.id);
          return (
            <div
              key={s.id}
              className="relative min-w-[140px] flex-1 border-r border-border last:border-r-0"
              style={{ height }}
              onDragOver={(e) => {
                if (!readOnly) e.preventDefault();
              }}
              onDrop={(e) => handleDrop(e, s.id)}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
                  style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN }}
                />
              ))}
              {colAppts.map((a) => {
                const endIso = resizePreview[a.id] || a.endAt;
                const resizing = !!resizePreview[a.id];
                return (
                  <div
                    key={a.id}
                    draggable={
                      !readOnly &&
                      !resizing &&
                      a.status !== 'CANCELLED' &&
                      a.status !== 'COMPLETED'
                    }
                    onDragStart={(e) => {
                      setDragId(a.id);
                      e.dataTransfer.setData('text/appointment-id', a.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onSelect?.(a)}
                    className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded-lg border px-1.5 py-1 text-[11px] shadow-sm active:cursor-grabbing ${
                      resizing ? 'border-rose ring-1 ring-rose/40' : 'border-white/40'
                    }`}
                    style={{
                      top: topFor(a.startAt),
                      height: Math.max(28, heightFor(a.startAt, endIso)),
                      background: s.color + '33',
                      borderLeft: `3px solid ${s.color}`,
                      zIndex: resizing ? 20 : 1,
                    }}
                    title={`${a.client.firstName} ${formatTime(a.startAt)}–${formatTime(endIso)}`}
                  >
                    <div className="font-semibold leading-tight">
                      {formatTime(a.startAt)}–{formatTime(endIso)} {a.client.firstName}
                    </div>
                    <div className="truncate text-[10px] opacity-80">
                      {a.services.map((x) => x.nameSnapshot).join(', ')}
                    </div>
                    {a.room?.name ? (
                      <div className="truncate text-[10px] opacity-70">🚪 {a.room.name}</div>
                    ) : null}
                    {a.depositPaidAt ? (
                      <div className="text-[10px] font-medium text-emerald-800">Депозит ✓</div>
                    ) : null}
                    <span className={`mt-0.5 inline-block badge scale-90 ${statusColors[a.status]}`}>
                      {statusLabels[a.status] || a.status}
                    </span>
                    {renderActions && !resizing ? (
                      <div className="mt-1" onClick={(ev) => ev.stopPropagation()}>
                        {renderActions(a)}
                      </div>
                    ) : null}
                    {!readOnly &&
                    onResize &&
                    a.status !== 'CANCELLED' &&
                    a.status !== 'COMPLETED' ? (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-2.5 cursor-ns-resize bg-black/10 hover:bg-rose/30"
                        onPointerDown={(e) => onResizePointerDown(e, a)}
                        onPointerMove={onResizePointerMove}
                        onPointerUp={(e) => onResizePointerUp(e, a)}
                        onPointerCancel={(e) => onResizePointerUp(e, a)}
                        title="Потягніть для зміни тривалості"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-border px-3 py-2 text-xs text-ink-muted">
        Drag — перенос · низ блоку — тривалість (live preview, крок 15 хв) ·{' '}
        {format(parseISO(day), 'd.MM.yyyy')}
      </div>
    </div>
  );
}
