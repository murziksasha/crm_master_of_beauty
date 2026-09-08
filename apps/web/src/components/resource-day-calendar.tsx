'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';
import { formatTime, statusColors, statusLabels } from '@/lib/utils';

type Staff = { id: string; displayName: string; color: string; specializations?: string[] };
type Room = { id: string; name: string; color?: string };
type Appt = {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: string;
  client: { firstName: string; lastName?: string | null };
  services: { nameSnapshot: string; durationSnapshot?: number }[];
  sale?: { id: string } | null;
  room?: { id: string; name: string } | null;
  roomId?: string | null;
  depositPaidAt?: string | null;
  depositAmount?: number | string | null;
};

const HOUR_START = 8;
const HOUR_END = 21;
const PX_PER_MIN = 1.2;
const BAND_COLORS = ['#C4787A', '#8B6F9E', '#6B8E7F', '#D4A574', '#5B8FA8'];

type Column = { id: string; label: string; color: string };

type Props = {
  day: string;
  staff: Staff[];
  rooms?: Room[];
  appointments: Appt[];
  onReschedule: (id: string, startAt: string, staffId: string, extra?: { roomId?: string | null }) => void;
  onResize?: (id: string, endAt: string) => void;
  onSelect?: (a: Appt) => void;
  renderActions?: (a: Appt) => React.ReactNode;
  readOnly?: boolean;
  viewMode?: 'staff' | 'room';
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
  rooms = [],
  appointments,
  onReschedule,
  onResize,
  onSelect,
  renderActions,
  readOnly,
  viewMode = 'staff',
}: Props) {
  const { start, totalMin } = useMemo(() => dayBounds(day), [day]);
  const height = totalMin * PX_PER_MIN;
  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
    [],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [resizePreview, setResizePreview] = useState<Record<string, string>>({});
  const resizeRef = useRef<{
    id: string;
    startY: number;
    origEnd: Date;
    apptStart: Date;
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const columns: Column[] = useMemo(() => {
    if (viewMode === 'room') {
      return rooms.map((r) => ({
        id: r.id,
        label: r.name,
        color: r.color || '#A78BFA',
      }));
    }
    return staff.map((s) => ({ id: s.id, label: s.displayName, color: s.color }));
  }, [viewMode, rooms, staff]);

  const isToday = format(now, 'yyyy-MM-dd') === day;
  const nowTop = differenceInMinutes(now, start) * PX_PER_MIN;

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

  function handleDrop(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/appointment-id') || dragId;
    if (!id || readOnly) return;
    const col = e.currentTarget as HTMLElement;
    const offsetMin = snapMinutes(e.clientY, col);
    const newStart = addMinutes(start, offsetMin);
    if (viewMode === 'room') {
      const appt = appointments.find((a) => a.id === id);
      onReschedule(id, newStart.toISOString(), appt?.staffId || staff[0]?.id, {
        roomId: columnId,
      });
    } else {
      onReschedule(id, newStart.toISOString(), columnId);
    }
    setDragId(null);
  }

  function dropOnAdjacentDay(offset: number) {
    if (!dragId || readOnly) return;
    const appt = appointments.find((a) => a.id === dragId);
    if (!appt) return;
    const next = addDays(new Date(appt.startAt), offset);
    onReschedule(dragId, next.toISOString(), appt.staffId);
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
        {columns.map((s) => (
          <div
            key={s.id}
            className="min-w-[140px] flex-1 border-r border-border px-2 py-2 text-center last:border-r-0"
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-sm font-semibold">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative flex max-h-[70vh] overflow-auto">
        <div
          className="absolute inset-y-0 left-0 z-20 w-6"
          onDragOver={(e) => {
            if (!readOnly) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            dropOnAdjacentDay(-1);
          }}
          title="Перетягнути на попередній день"
        />
        <div
          className="absolute inset-y-0 right-0 z-20 w-6"
          onDragOver={(e) => {
            if (!readOnly) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            dropOnAdjacentDay(1);
          }}
          title="Перетягнути на наступний день"
        />

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

        {columns.map((col) => {
          const colAppts = appointments.filter((a) =>
            viewMode === 'room' ? a.roomId === col.id || a.room?.id === col.id : a.staffId === col.id,
          );
          return (
            <div
              key={col.id}
              className="relative min-w-[140px] flex-1 border-r border-border last:border-r-0"
              style={{ height }}
              onDragOver={(e) => {
                if (!readOnly) e.preventDefault();
              }}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
                  style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN }}
                />
              ))}
              {isToday && nowTop > 0 && nowTop < height ? (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                  style={{ top: nowTop }}
                >
                  <span className="relative ml-[-4px] h-2.5 w-2.5 rounded-full bg-red-500">
                    <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-70" />
                  </span>
                  <span className="h-[2px] flex-1 bg-red-500" />
                </div>
              ) : null}
              {colAppts.map((a) => {
                const endIso = resizePreview[a.id] || a.endAt;
                const resizing = !!resizePreview[a.id];
                const totalDur = Math.max(
                  1,
                  differenceInMinutes(new Date(endIso), new Date(a.startAt)),
                );
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
                      background: col.color + '33',
                      borderLeft: `3px solid ${col.color}`,
                      zIndex: resizing ? 20 : 1,
                      touchAction: 'none',
                    }}
                    title={`${a.client.firstName} ${formatTime(a.startAt)}–${formatTime(endIso)}`}
                  >
                    {a.services.length > 1 ? (
                      <div className="mb-0.5 flex h-1 overflow-hidden rounded">
                        {a.services.map((s, i) => (
                          <div
                            key={`${a.id}-b-${i}`}
                            style={{
                              width: `${Math.max(8, ((s.durationSnapshot || totalDur / a.services.length) / totalDur) * 100)}%`,
                              background: BAND_COLORS[i % BAND_COLORS.length],
                            }}
                            title={`${s.nameSnapshot} ${s.durationSnapshot || ''}хв`}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className="font-semibold leading-tight">
                      {formatTime(a.startAt)}–{formatTime(endIso)} {a.client.firstName}
                    </div>
                    <div className="truncate text-[10px] opacity-80">
                      {a.services.map((x) => x.nameSnapshot).join(' → ')}
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
        Drag між майстрами · краї календаря — сусідній день · низ блоку — тривалість ·{' '}
        {format(parseISO(day), 'd.MM.yyyy')}
      </div>
    </div>
  );
}
