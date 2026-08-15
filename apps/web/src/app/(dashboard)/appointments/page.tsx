'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay, startOfWeek } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canTakePayment, isMaster } from '@/lib/roles';
import {
  appointmentIcsBlob,
  formatDateTime,
  formatMoney,
  formatTime,
  googleCalendarUrl,
  paymentLabels,
  statusColors,
  statusLabels,
} from '@/lib/utils';
import { useBranch } from '@/lib/branch-context';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';
import { ResourceDayCalendar } from '@/components/resource-day-calendar';

export default function AppointmentsPage() {
  const { user } = useAuth();
  const masterMode = isMaster(user?.role);
  const canPay = canTakePayment(user?.role);
  const { branchId } = useBranch();
  const qc = useQueryClient();
  const [view, setView] = useState<'timeline' | 'day' | 'week'>('timeline');
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    staffId: '',
    serviceIds: [] as string[],
    date: format(new Date(), 'yyyy-MM-dd'),
    slot: '',
    notes: '',
    roomId: '',
  });
  const [payForm, setPayForm] = useState({
    method: 'CARD',
    discountAmount: 0,
    loyaltyRedeem: 0,
    giftCode: '',
    packageId: '',
    packageSessions: 1,
  });

  const range = useMemo(() => {
    if (view === 'week') {
      const weekStart = startOfWeek(new Date(day), { weekStartsOn: 1 });
      return {
        from: startOfDay(weekStart).toISOString(),
        to: addDays(startOfDay(weekStart), 7).toISOString(),
        weekStart,
      };
    }
    return {
      from: startOfDay(new Date(day)).toISOString(),
      to: addDays(startOfDay(new Date(day)), 1).toISOString(),
      weekStart: startOfDay(new Date(day)),
    };
  }, [day, view]);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments', day, view, branchId],
    queryFn: () => api<any[]>(`/appointments?from=${range.from}&to=${range.to}`),
    enabled: !!branchId,
    refetchInterval: 20_000,
  });

  const weekDays = useMemo(() => {
    if (view !== 'week') return [];
    return Array.from({ length: 7 }, (_, i) => addDays(range.weekStart, i));
  }, [view, range.weekStart]);
  const { data: staff } = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api<any[]>('/staff'),
    enabled: !!branchId,
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: () => api<{ items: any[] }>('/clients?limit=100'),
  });
  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => api<any[]>('/services'),
  });
  const { data: rooms } = useQuery({
    queryKey: ['rooms', branchId],
    queryFn: () => api<any[]>('/rooms'),
    enabled: !!branchId,
  });

  const slotsQuery = useQuery({
    queryKey: ['admin-slots', form.staffId, form.date, form.serviceIds.join(',')],
    queryFn: () =>
      api<{ slots: string[] }>(
        `/appointments/slots?staffId=${form.staffId}&date=${form.date}&serviceIds=${form.serviceIds.join(',')}`,
      ),
    enabled: open && !!form.staffId && !!form.date && form.serviceIds.length > 0,
  });

  const suggestQuery = useQuery({
    queryKey: ['suggest', form.clientId, form.serviceIds.join(','), form.date, branchId],
    queryFn: () =>
      api<any>(
        `/appointments/suggest?clientId=${form.clientId || ''}&serviceIds=${form.serviceIds.join(',')}&date=${form.date}`,
      ),
    enabled: open && form.serviceIds.length > 0 && !!form.date,
  });

  useEffect(() => {
    setForm((f) => ({ ...f, slot: '' }));
  }, [form.staffId, form.date, form.serviceIds.join(',')]);

  const create = useMutation({
    mutationFn: () =>
      api('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          staffId: form.staffId,
          serviceIds: form.serviceIds,
          startAt: form.slot,
          notes: form.notes,
          roomId: form.roomId || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const reschedule = useMutation({
    mutationFn: (body: {
      id: string;
      startAt?: string;
      endAt?: string;
      staffId?: string;
      roomId?: string | null;
    }) =>
      api(`/appointments/${body.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          startAt: body.startAt,
          endAt: body.endAt,
          staffId: body.staffId,
          roomId: body.roomId,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const mockDeposit = useMutation({
    mutationFn: (appointmentId: string) =>
      api('/payments/mock-deposit', {
        method: 'POST',
        body: JSON.stringify({ appointmentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const refundDeposit = useMutation({
    mutationFn: (appointmentId: string) =>
      api('/payments/deposit-refund', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId,
          reason: 'Повернення з CRM',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const { data: clientPackages } = useQuery({
    queryKey: ['client-packages', payOpen?.clientId],
    queryFn: () => api<any[]>(`/loyalty/packages/client/${payOpen.clientId}`),
    enabled: !!payOpen?.clientId,
  });

  const pay = useMutation({
    mutationFn: () => {
      const selectedPkg = clientPackages?.find((p) => p.id === payForm.packageId);
      const pkgServiceId = selectedPkg?.template?.serviceId;
      const sessionsWant = Math.max(1, Number(payForm.packageSessions) || 1);
      let freeLeft = payForm.packageId
        ? Math.min(sessionsWant, selectedPkg?.sessionsLeft || sessionsWant)
        : 0;
      const items =
        payOpen?.services?.map((s: any) => {
          const matches =
            !!payForm.packageId && (!pkgServiceId || s.serviceId === pkgServiceId);
          const free = matches && freeLeft > 0;
          if (free) freeLeft -= 1;
          return {
            type: 'SERVICE',
            refId: s.serviceId,
            name: s.nameSnapshot,
            qty: 1,
            unitPrice: free ? 0 : Number(s.priceSnapshot),
          };
        }) || [];
      return api('/cash', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: payOpen.id,
          clientId: payOpen.clientId,
          items,
          method: payForm.method,
          discountAmount: Number(payForm.discountAmount) || 0,
          loyaltyRedeem: Number(payForm.loyaltyRedeem) || 0,
          giftCode: payForm.giftCode?.trim() || undefined,
          packageId: payForm.packageId || undefined,
          packageSessions: payForm.packageId
            ? Math.max(1, Number(payForm.packageSessions) || 1)
            : undefined,
        }),
      });
    },
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['cash-today'] });
      setPayOpen(null);
      setReceipt(sale);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const byStaff = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of staff || []) map.set(s.id, []);
    for (const a of appointments || []) {
      const list = map.get(a.staffId) || [];
      list.push(a);
      map.set(a.staffId, list);
    }
    return map;
  }, [appointments, staff]);

  const depositCredit = useMemo(() => {
    if (!payOpen?.depositPaidAt || !payOpen?.depositAmount) return 0;
    return Number(payOpen.depositAmount) || 0;
  }, [payOpen]);

  const totalPreview = useMemo(() => {
    if (!payOpen) return 0;
    const selectedPkg = clientPackages?.find((p) => p.id === payForm.packageId);
    const pkgServiceId = selectedPkg?.template?.serviceId;
    let freeLeft = payForm.packageId
      ? Math.min(
          Math.max(1, Number(payForm.packageSessions) || 1),
          selectedPkg?.sessionsLeft || 99,
        )
      : 0;
    const sub = payOpen.services.reduce((s: number, x: any) => {
      const matches =
        !!payForm.packageId && (!pkgServiceId || x.serviceId === pkgServiceId);
      if (matches && freeLeft > 0) {
        freeLeft -= 1;
        return s;
      }
      return s + Number(x.priceSnapshot);
    }, 0);
    return Math.max(
      0,
      sub -
        Number(payForm.discountAmount || 0) -
        Number(payForm.loyaltyRedeem || 0) -
        depositCredit,
    );
  }, [payOpen, payForm, depositCredit, clientPackages]);

  function shiftDay(delta: number) {
    const step = view === 'week' ? 7 : 1;
    const next = addDays(new Date(day), delta * step);
    setDay(format(next, 'yyyy-MM-dd'));
  }

  function renderActions(a: any) {
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {a.status === 'CONFIRMED' || a.status === 'PENDING' ? (
          <>
            <button
              className="btn btn-secondary px-2 py-1 text-xs"
              onClick={() => setStatus.mutate({ id: a.id, status: 'IN_PROGRESS' })}
            >
              Check-in
            </button>
            <button
              className="btn btn-ghost px-2 py-1 text-xs"
              onClick={() => setStatus.mutate({ id: a.id, status: 'IN_PROGRESS' })}
            >
              Почати
            </button>
          </>
        ) : null}
        {a.status === 'IN_PROGRESS' ? (
          <button
            className="btn btn-secondary px-2 py-1 text-xs"
            onClick={() => setStatus.mutate({ id: a.id, status: 'COMPLETED' })}
          >
            Завершити
          </button>
        ) : null}
        {canPay && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && !a.sale ? (
          <button
            className="btn btn-primary px-2 py-1 text-xs"
            onClick={() => {
              setPayOpen(a);
              setPayForm({
                method: 'CARD',
                discountAmount: 0,
                loyaltyRedeem: 0,
                giftCode: '',
                packageId: '',
                packageSessions: 1,
              });
              setError(null);
            }}
          >
            Оплата
          </button>
        ) : null}
        {canPay &&
        a.depositAmount &&
        !a.depositPaidAt &&
        a.status !== 'CANCELLED' &&
        a.status !== 'COMPLETED' ? (
          <button
            className="btn btn-secondary px-2 py-1 text-xs"
            onClick={() => mockDeposit.mutate(a.id)}
            disabled={mockDeposit.isPending}
          >
            Mock депозит
          </button>
        ) : null}
        {canPay && a.depositPaidAt ? (
          <button
            className="btn btn-ghost px-2 py-1 text-xs text-amber-800"
            onClick={() => {
              if (confirm('Позначити депозит як повернутий?')) {
                refundDeposit.mutate(a.id);
              }
            }}
            disabled={refundDeposit.isPending}
          >
            Повернути депозит
          </button>
        ) : null}
        {!masterMode && rooms?.length && a.status !== 'CANCELLED' && a.status !== 'COMPLETED' ? (
          <select
            className="input max-w-[8rem] py-1 text-xs"
            value={a.roomId || ''}
            title="Кабінет"
            onChange={(e) =>
              reschedule.mutate({
                id: a.id,
                roomId: e.target.value || null,
              })
            }
          >
            <option value="">Кабінет…</option>
            {rooms.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : null}
        <a
          className="btn btn-ghost px-2 py-1 text-xs"
          href={googleCalendarUrl({
            title: `${a.client.firstName} · ${(a.services || []).map((s: any) => s.nameSnapshot).join(', ')}`,
            startAt: a.startAt,
            endAt: a.endAt,
            details: a.staff?.displayName || '',
            location: a.room?.name || '',
          })}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          GCal
        </a>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            const blob = appointmentIcsBlob({
              title: `${a.client.firstName} · Master of Beauty`,
              startAt: a.startAt,
              endAt: a.endAt,
              description: (a.services || []).map((s: any) => s.nameSnapshot).join(', '),
              location: a.room?.name || '',
              uid: a.id,
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `appt-${a.id.slice(0, 8)}.ics`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          .ics
        </button>
        {!masterMode && a.status !== 'CANCELLED' && a.status !== 'COMPLETED' ? (
          <button
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={() => setStatus.mutate({ id: a.id, status: 'CANCELLED' })}
          >
            Скасувати
          </button>
        ) : null}
        {a.status !== 'NO_SHOW' && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
          <button
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={() => setStatus.mutate({ id: a.id, status: 'NO_SHOW' })}
          >
            No-show
          </button>
        ) : null}
      </div>
    );
  }

  function renderCard(a: any, showDate = false) {
    return (
      <div key={a.id} className="rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">
              {showDate ? `${format(new Date(a.startAt), 'EEE d.MM', { locale: uk })} · ` : ''}
              {formatTime(a.startAt)}–{formatTime(a.endAt)}
            </div>
            <div className="text-sm">
              {a.client.firstName} {a.client.lastName || ''}
            </div>
            <div className="text-xs text-ink-muted">
              {a.services.map((x: any) => x.nameSnapshot).join(', ')}
            </div>
            {a.room?.name ? (
              <div className="text-xs text-ink-muted">🚪 {a.room.name}</div>
            ) : null}
            {view === 'week' ? (
              <div className="text-xs text-ink-muted">{a.staff?.displayName}</div>
            ) : null}
            {a.depositPaidAt ? (
              <div className="mt-1 text-xs font-medium text-emerald-700">
                Депозит {formatMoney(a.depositAmount)} ✓
              </div>
            ) : a.depositAmount && Number(a.depositAmount) > 0 ? (
              <div className="mt-1 text-xs text-amber-700">
                Депозит {formatMoney(a.depositAmount)} очікується
              </div>
            ) : null}
            {a.sale ? (
              <div className="mt-1 text-xs font-medium text-emerald-700">
                Оплачено · {formatMoney(a.sale.total)}
              </div>
            ) : null}
          </div>
          <span className={`badge ${statusColors[a.status]}`}>{statusLabels[a.status]}</span>
        </div>
        {renderActions(a)}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={masterMode ? 'Мій розклад' : 'Записи'}
        subtitle={
          masterMode
            ? 'Ваші візити · день або тиждень'
            : 'Календар візитів по майстрах · день / тиждень'
        }
        actions={
          <>
            <div className="flex rounded-xl border border-border bg-white p-1">
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'timeline' ? 'bg-rose-soft text-rose-dark' : 'text-ink-muted'}`}
                onClick={() => setView('timeline')}
              >
                Timeline
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'day' ? 'bg-rose-soft text-rose-dark' : 'text-ink-muted'}`}
                onClick={() => setView('day')}
              >
                День
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'week' ? 'bg-rose-soft text-rose-dark' : 'text-ink-muted'}`}
                onClick={() => setView('week')}
              >
                Тиждень
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn btn-secondary p-2" onClick={() => shiftDay(-1)} aria-label="Назад">
                <ChevronLeft size={16} />
              </button>
              <input
                className="input w-auto"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
              <button className="btn btn-secondary p-2" onClick={() => shiftDay(1)} aria-label="Далі">
                <ChevronRight size={16} />
              </button>
              <button className="btn btn-ghost text-sm" onClick={() => setDay(format(new Date(), 'yyyy-MM-dd'))}>
                Сьогодні
              </button>
            </div>
            {!masterMode || user?.staffProfileId ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setForm({
                    clientId: clients?.items?.[0]?.id || '',
                    staffId: masterMode
                      ? user?.staffProfileId || ''
                      : staff?.[0]?.id || '',
                    serviceIds: [],
                    date: day,
                    slot: '',
                    notes: '',
                    roomId: '',
                  });
                  setError(null);
                  setOpen(true);
                }}
              >
                <Plus size={16} /> Новий запис
              </button>
            ) : null}
          </>
        }
      />

      {error && view === 'timeline' ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingBlock />
      ) : view === 'timeline' ? (
        <ResourceDayCalendar
          day={day}
          staff={(staff || []).filter((s: any) => !masterMode || s.id === user?.staffProfileId)}
          appointments={appointments || []}
          readOnly={false}
          onReschedule={(id, startAt, staffId) => reschedule.mutate({ id, startAt, staffId })}
          onResize={(id, endAt) => reschedule.mutate({ id, endAt })}
          renderActions={(a) => renderActions(a)}
        />
      ) : view === 'week' ? (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-7 divide-x divide-border">
            {weekDays.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const dayAppts = (appointments || [])
                .filter((a) => format(new Date(a.startAt), 'yyyy-MM-dd') === key)
                .sort(
                  (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
                );
              const isToday = key === format(new Date(), 'yyyy-MM-dd');
              return (
                <div key={key} className="min-h-[28rem]">
                  <div
                    className={`border-b border-border px-2 py-3 text-center text-sm font-semibold ${
                      isToday ? 'bg-rose-soft text-rose-dark' : 'bg-cream'
                    }`}
                  >
                    {format(d, 'EEE d.MM', { locale: uk })}
                    <div className="text-xs font-normal text-ink-muted">{dayAppts.length} візит.</div>
                  </div>
                  <div className="space-y-2 p-2">
                    {dayAppts.length === 0 ? (
                      <div className="py-6 text-center text-xs text-ink-muted">—</div>
                    ) : (
                      dayAppts.map((a) => renderCard(a))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {(staff || []).map((s) => (
            <section key={s.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                <span className="font-semibold">{s.displayName}</span>
                <span className="ml-auto text-xs text-ink-muted">
                  {(byStaff.get(s.id) || []).length} записів
                </span>
              </div>
              <div className="max-h-[28rem] space-y-2 overflow-auto p-3">
                {(byStaff.get(s.id) || []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-muted">Вільно</div>
                ) : (
                  (byStaff.get(s.id) || []).map((a) => renderCard(a))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Новий запис" wide>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.serviceIds.length) {
              setError('Оберіть хоча б одну послугу');
              return;
            }
            if (!form.slot) {
              setError('Оберіть вільний час');
              return;
            }
            create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Клієнт">
              <select
                className="input"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                required
              >
                <option value="">Оберіть...</option>
                {clients?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName || ''} · {c.phone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Майстер">
              <select
                className="input"
                value={form.staffId}
                onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                required
                disabled={masterMode}
              >
                {staff?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Кабінет (опційно)">
            <select
              className="input"
              value={form.roomId}
              onChange={(e) => setForm({ ...form, roomId: e.target.value })}
            >
              <option value="">Без кабінету</option>
              {(rooms || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.capacity > 1 ? `(×${r.capacity})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Послуги">
            <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-border p-2">
              {services?.map((s) => {
                const checked = form.serviceIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-cream"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm({
                          ...form,
                          serviceIds: checked
                            ? form.serviceIds.filter((id) => id !== s.id)
                            : [...form.serviceIds, s.id],
                        })
                      }
                    />
                    <span className="flex-1 text-sm">{s.name}</span>
                    <span className="text-xs text-ink-muted">
                      {s.durationMin} хв · {formatMoney(s.price)}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>

          {suggestQuery.data?.suggestions?.length ? (
            <div className="rounded-xl border border-border bg-cream/50 p-3">
              <div className="mb-2 text-sm font-semibold">Розумні пропозиції</div>
              <div className="flex flex-wrap gap-2">
                {suggestQuery.data.suggestions.slice(0, 4).map((s: any) => (
                  <button
                    key={s.staffId}
                    type="button"
                    className={`btn px-2 py-1 text-xs ${
                      form.staffId === s.staffId ? 'btn-primary' : 'btn-secondary'
                    }`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        staffId: s.staffId,
                        slot: s.nextSlots?.[0] || '',
                      }))
                    }
                  >
                    {s.displayName}
                    {s.preferred ? ' ★' : ''} · {s.slotsCount} слотів
                  </button>
                ))}
              </div>
              {suggestQuery.data.upsell?.length ? (
                <div className="mt-2 text-xs text-ink-muted">
                  Upsell: {suggestQuery.data.upsell.map((u: any) => u.name).join(', ')}
                </div>
              ) : null}
            </div>
          ) : null}

          <Field label="Дата">
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>

          <Field label="Вільні слоти">
            {!form.serviceIds.length || !form.staffId ? (
              <div className="text-sm text-ink-muted">Оберіть майстра та послуги</div>
            ) : slotsQuery.isLoading ? (
              <div className="text-sm text-ink-muted">Завантаження слотів...</div>
            ) : !slotsQuery.data?.slots?.length ? (
              <div className="text-sm text-ink-muted">Немає вільних слотів</div>
            ) : (
              <div className="grid max-h-40 grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
                {slotsQuery.data.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`rounded-xl border px-2 py-2 text-sm font-medium ${
                      form.slot === slot ? 'border-rose bg-rose-soft' : 'border-border'
                    }`}
                    onClick={() => setForm({ ...form, slot })}
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="Нотатка">
            <textarea
              className="input min-h-16"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={create.isPending}>
            Створити запис
          </button>
        </form>
      </Modal>

      <Modal open={!!payOpen} onClose={() => setPayOpen(null)} title="Оплата візиту">
        {payOpen ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-cream p-3 text-sm">
              <div className="font-medium">
                {payOpen.client.firstName} {payOpen.client.lastName || ''}
              </div>
              <div className="mt-2 space-y-1">
                {payOpen.services.map((s: any) => (
                  <div key={s.id} className="flex justify-between">
                    <span>{s.nameSnapshot}</span>
                    <span>{formatMoney(s.priceSnapshot)}</span>
                  </div>
                ))}
              </div>
              {depositCredit > 0 ? (
                <div className="mt-2 flex justify-between rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800">
                  <span>Депозит (онлайн)</span>
                  <span>-{formatMoney(depositCredit)}</span>
                </div>
              ) : null}
            </div>
            {clientPackages?.length ? (
              <>
                <Field label="Абонемент (списати сеанси)">
                  <select
                    className="input"
                    value={payForm.packageId}
                    onChange={(e) =>
                      setPayForm({
                        ...payForm,
                        packageId: e.target.value,
                        packageSessions: 1,
                      })
                    }
                  >
                    <option value="">Без абонемента</option>
                    {clientPackages.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · лишилось {p.sessionsLeft}
                        {p.template?.service?.name ? ` · ${p.template.service.name}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                {payForm.packageId ? (
                  <Field label="Скільки сеансів списати">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={
                        clientPackages.find((p: any) => p.id === payForm.packageId)
                          ?.sessionsLeft || 1
                      }
                      value={payForm.packageSessions}
                      onChange={(e) =>
                        setPayForm({
                          ...payForm,
                          packageSessions: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
            <Field label="Спосіб оплати">
              <select
                className="input"
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              >
                <option value="CASH">Готівка</option>
                <option value="CARD">Картка</option>
                <option value="MIXED">Змішана</option>
                <option value="TRANSFER">Переказ</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Знижка ₴">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={payForm.discountAmount}
                  onChange={(e) =>
                    setPayForm({ ...payForm, discountAmount: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Бонуси ₴">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={payForm.loyaltyRedeem}
                  onChange={(e) =>
                    setPayForm({ ...payForm, loyaltyRedeem: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="Подарунковий сертифікат (код)">
              <input
                className="input font-mono uppercase"
                placeholder="GIFT-XXXX"
                value={payForm.giftCode}
                onChange={(e) => setPayForm({ ...payForm, giftCode: e.target.value })}
              />
            </Field>
            <div className="text-right text-lg font-bold">
              До сплати: {formatMoney(totalPreview)}
            </div>
            <p className="text-xs text-ink-muted">
              {depositCredit > 0
                ? 'Депозит автоматично зменшує суму на касі. '
                : ''}
              Сертифікат спишеться з балансу після проведення.
            </p>
            <ErrorText error={error} />
            <button className="btn btn-primary w-full" onClick={() => pay.mutate()} disabled={pay.isPending}>
              Провести оплату
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Чек">
        {receipt ? (
          <div>
            <div className="print-receipt space-y-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold">Master of Beauty</div>
                <div className="text-ink-muted">Фіскальний чек (внутрішній)</div>
              </div>
              <div className="flex justify-between">
                <span>№ {receipt.number}</span>
                <span>{formatDateTime(receipt.paidAt || new Date().toISOString())}</span>
              </div>
              <div className="border-t border-border pt-2">
                {(receipt.items || []).map((item: any) => (
                  <div key={item.id || item.name} className="flex justify-between py-1">
                    <span>
                      {item.name} × {Number(item.qty)}
                    </span>
                    <span>{formatMoney(item.total)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 border-t border-border pt-2">
                <div className="flex justify-between">
                  <span>Підсумок</span>
                  <span>{formatMoney(receipt.subtotal)}</span>
                </div>
                {Number(receipt.discountAmount) > 0 ? (
                  <div className="flex justify-between">
                    <span>Знижка</span>
                    <span>-{formatMoney(receipt.discountAmount)}</span>
                  </div>
                ) : null}
                {Number(receipt.loyaltyRedeem) > 0 ? (
                  <div className="flex justify-between">
                    <span>Бонуси</span>
                    <span>-{formatMoney(receipt.loyaltyRedeem)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold">
                  <span>До сплати</span>
                  <span>{formatMoney(receipt.total)}</span>
                </div>
                <div className="text-ink-muted">
                  Оплата: {paymentLabels[receipt.method] || receipt.method}
                </div>
              </div>
              <div className="pt-2 text-center text-xs text-ink-muted">Дякуємо, що обрали нас!</div>
            </div>
            <div className="no-print mt-4 flex gap-2">
              <button className="btn btn-primary flex-1" onClick={() => window.print()}>
                <Printer size={16} /> Друкувати
              </button>
              <button className="btn btn-secondary flex-1" onClick={() => setReceipt(null)}>
                Закрити
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
