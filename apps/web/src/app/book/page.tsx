'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ArrowLeft, CheckCircle2, Sparkles, X } from 'lucide-react';
import { publicApi } from '@/lib/api';
import {
  appointmentIcsBlob,
  formatDateTime,
  formatMoney,
  formatTime,
  googleCalendarUrl,
} from '@/lib/utils';
import { ErrorText, Field } from '@/components/ui';

const ANY_MASTER = 'any';

export default function BookPage() {
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(ANY_MASTER);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [slot, setSlot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<any | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    notes: '',
    website: '',
  });
  const [payDeposit, setPayDeposit] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [paymentResult, setPaymentResult] = useState<{
    order?: string | null;
    status?: string | null;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('rebook')) {
      const ids = q.get('services')?.split(',').filter(Boolean) || [];
      if (ids.length) setServiceIds(ids);
      if (q.get('staff')) setStaffId(q.get('staff') || ANY_MASTER);
      setStep(ids.length ? 2 : 1);
    }
    if (q.get('payment') === 'result') {
      setPaymentResult({ order: q.get('order'), status: q.get('status') });
      setStep(5);
      setDone({
        message:
          q.get('status') === 'failure'
            ? 'Оплату не завершено. Запис збережено — звʼяжіться з салоном або спробуйте знову.'
            : 'Дякуємо! Якщо депозит пройшов, запис буде підтверджено автоматично.',
        paymentReturn: true,
        orderId: q.get('order'),
      });
    }
  }, []);

  const { data: salon } = useQuery({
    queryKey: ['public-salon'],
    queryFn: () => publicApi.salon() as Promise<any>,
  });
  const { data: categories } = useQuery({
    queryKey: ['public-services'],
    queryFn: () => publicApi.services(),
  });
  const { data: staff } = useQuery({
    queryKey: ['public-staff', branchId],
    queryFn: () => publicApi.staff(undefined, branchId || undefined),
    enabled: serviceIds.length > 0,
  });
  const serviceKey = serviceIds.join(',');
  const { data: slotsData } = useQuery({
    queryKey: ['public-slots', staffId, date, serviceKey, branchId],
    queryFn: () => publicApi.slots(staffId || ANY_MASTER, date, serviceKey, branchId || undefined),
    enabled: !!date && serviceIds.length > 0,
  });
  const { data: rooms } = useQuery({
    queryKey: ['public-rooms', branchId],
    queryFn: () => publicApi.rooms(branchId || undefined),
    enabled: !!branchId || !!salon,
  });
  const monthStart = format(startOfMonth(parseISO(month)), 'yyyy-MM-dd');
  const { data: availability } = useQuery({
    queryKey: ['public-availability', monthStart, serviceKey, staffId, branchId],
    queryFn: () =>
      publicApi.availability({
        from: monthStart,
        serviceIds: serviceKey,
        staffId: staffId || ANY_MASTER,
        days: 42,
        branchId: branchId || undefined,
      }),
    enabled: step === 3 && serviceIds.length > 0,
  });

  const allServices = useMemo(
    () => (categories || []).flatMap((c: any) => c.services.map((s: any) => ({ ...s, category: c.name }))),
    [categories],
  );
  const selectedServices = allServices.filter((s: any) => serviceIds.includes(s.id));
  const selectedStaff = staff?.find((s: any) => s.id === staffId);
  const selectedBranch = salon?.branches?.find((b: any) => b.id === branchId);
  const selectedRoom = rooms?.find((r: any) => r.id === roomId);
  const durationMin = selectedServices.reduce(
    (s: number, x: any) => s + Number(x.durationMin || 0) + Number(x.bufferMin || 0),
    0,
  );
  const totalPrice = selectedServices.reduce((s: number, x: any) => s + Number(x.price || 0), 0);

  const qualifiedStaff = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s: any) => {
      const ids = (s.services || []).map((x: any) => x.serviceId);
      return serviceIds.every((id) => ids.includes(id));
    });
  }, [staff, serviceIds]);

  const book = useMutation({
    mutationFn: () =>
      publicApi.book({
        ...form,
        staffId: staffId || ANY_MASTER,
        startAt: slot,
        serviceIds,
        branchId: branchId || undefined,
        roomId: roomId || undefined,
        payDeposit: payDeposit || salon?.depositRequired,
      }),
    onSuccess: (res: any) => {
      setDone(res);
      setStep(5);
      setError(null);
      if (res?.payment?.form?.action) {
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = res.payment.form.action;
        f.acceptCharset = 'utf-8';
        for (const [k, v] of Object.entries({
          data: res.payment.form.data,
          signature: res.payment.form.signature,
        })) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = String(v);
          f.appendChild(input);
        }
        document.body.appendChild(f);
        f.submit();
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const joinWaitlist = useMutation({
    mutationFn: () =>
      publicApi.waitlist({
        firstName: form.firstName || 'Клієнт',
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        branchId: branchId || undefined,
        serviceId: serviceIds[0],
        staffId: staffId !== ANY_MASTER ? staffId : undefined,
        preferredDate: date,
        preferredTimeFrom: '10:00',
        preferredTimeTo: '19:00',
        notes: form.notes || 'З онлайн-запису (немає слотів)',
      }),
    onSuccess: (res: any) => {
      setDone({ message: res.message, waitlist: true });
      setStep(5);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const canNext = useMemo(() => {
    if (step === 0) return !!branchId || !salon?.branches?.length;
    if (step === 1) return serviceIds.length > 0;
    if (step === 2) return !!staffId;
    if (step === 3) return !!slot;
    if (step === 4) return form.firstName && form.phone.length >= 9;
    return false;
  }, [step, serviceIds, staffId, slot, form, branchId, salon]);

  function toggleService(id: string) {
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSlot('');
  }

  const availMap = useMemo(() => {
    const m = new Map<string, { slotsCount: number; full: boolean }>();
    for (const d of availability?.days || []) m.set(d.date, d);
    return m;
  }, [availability]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(parseISO(month));
    const first = start.getDay() === 0 ? 6 : start.getDay() - 1;
    const days: (string | null)[] = Array.from({ length: first }, () => null);
    const dim = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= dim; i++) {
      days.push(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
      );
    }
    return days;
  }, [month]);

  const stickyLabel = selectedServices.map((s: any) => s.name).join(' + ') || 'Оберіть послуги';

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/" className="btn btn-ghost">
          <ArrowLeft size={16} /> На головну
        </Link>
        <div className="flex items-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose text-white">
            <Sparkles size={16} />
          </span>
          Онлайн-запис
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <div className="mb-6 flex gap-2">
          {[0, 1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-rose' : 'bg-border'}`}
            />
          ))}
        </div>

        <div className="card p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Оберіть філію</h1>
              <div className="grid gap-3">
                {(salon?.branches || []).map((b: any) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`rounded-xl border p-4 text-left ${
                      branchId === b.id ? 'border-rose bg-rose-soft' : 'border-border'
                    }`}
                    onClick={() => {
                      setBranchId(b.id);
                      setStaffId(ANY_MASTER);
                      setSlot('');
                    }}
                  >
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-sm text-ink-muted">{b.address}</div>
                  </button>
                ))}
                {!salon?.branches?.length ? (
                  <div className="text-sm text-ink-muted">Філії завантажуються...</div>
                ) : null}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Оберіть послуги</h1>
              <p className="text-sm text-ink-muted">Можна кілька послуг в одному візиті</p>
              {categories?.map((cat: any) => (
                <div key={cat.id}>
                  <div className="mb-2 text-sm font-semibold text-ink-muted">{cat.name}</div>
                  <div className="space-y-2">
                    {cat.services.map((s: any) => {
                      const on = serviceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                            on ? 'border-rose bg-rose-soft' : 'border-border hover:border-gold'
                          }`}
                          onClick={() => toggleService(s.id)}
                        >
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-ink-muted">{s.durationMin} хв</div>
                          </div>
                          <div className="font-semibold">{formatMoney(s.price)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Оберіть майстра</h1>
              <p className="text-sm text-ink-muted">
                {selectedServices.map((s: any) => s.name).join(' + ')}
              </p>
              <button
                type="button"
                className={`w-full rounded-xl border p-4 text-left ${
                  staffId === ANY_MASTER ? 'border-rose bg-rose-soft' : 'border-border'
                }`}
                onClick={() => {
                  setStaffId(ANY_MASTER);
                  setSlot('');
                }}
              >
                <div className="font-semibold">Будь-який вільний майстер</div>
                <div className="text-xs text-ink-muted">
                  Покажемо всі вільні слоти серед кваліфікованих майстрів
                </div>
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                {qualifiedStaff.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`rounded-xl border p-4 text-left ${
                      staffId === s.id ? 'border-rose bg-rose-soft' : 'border-border'
                    }`}
                    onClick={() => {
                      setStaffId(s.id);
                      setSlot('');
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                        style={{ background: s.color }}
                      >
                        {s.displayName.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-semibold">{s.displayName}</div>
                        <div className="text-xs text-ink-muted">
                          {s.specializations?.join(' · ')}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Дата і час</h1>
              <p className="text-sm text-ink-muted">
                {staffId === ANY_MASTER ? 'Будь-який майстер' : selectedStaff?.displayName} ·{' '}
                {durationMin} хв
              </p>
              {rooms?.length ? (
                <Field label="Кабінет (за бажанням)">
                  <select
                    className="input"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="">Без уподобань</option>
                    {rooms.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <div className="flex items-center justify-between">
                <button
                  className="btn btn-ghost px-2 py-1 text-sm"
                  onClick={() =>
                    setMonth(format(addDays(startOfMonth(parseISO(month)), -1), 'yyyy-MM-dd'))
                  }
                >
                  ←
                </button>
                <div className="font-semibold capitalize">
                  {format(parseISO(month), 'LLLL yyyy', { locale: uk })}
                </div>
                <button
                  className="btn btn-ghost px-2 py-1 text-sm"
                  onClick={() =>
                    setMonth(
                      format(
                        new Date(
                          parseISO(month).getFullYear(),
                          parseISO(month).getMonth() + 1,
                          1,
                        ),
                        'yyyy-MM-dd',
                      ),
                    )
                  }
                >
                  →
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-muted">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
                {monthDays.map((d, i) => {
                  if (!d) return <div key={`e-${i}`} />;
                  const info = availMap.get(d);
                  const past = d < format(new Date(), 'yyyy-MM-dd');
                  const selected = date === d;
                  const open = !past && info && info.slotsCount > 0;
                  const full = !past && info && info.full;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={past}
                      onClick={() => {
                        setDate(d);
                        setSlot('');
                      }}
                      className={`rounded-lg py-2 text-sm ${
                        selected
                          ? 'bg-rose text-white'
                          : past
                            ? 'text-ink-muted/40'
                            : open
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                              : full
                                ? 'bg-border/60 text-ink-muted'
                                : 'hover:bg-cream-dark'
                      }`}
                    >
                      {Number(d.slice(-2))}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 text-[11px] text-ink-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-400" /> є слоти
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-border" /> зайнято
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slotsData?.slots?.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                      slot === s ? 'border-rose bg-rose-soft' : 'border-border'
                    }`}
                    onClick={() => setSlot(s)}
                  >
                    {formatTime(s)}
                    {staffId === ANY_MASTER && slotsData.options ? (
                      <div className="text-[10px] font-normal text-ink-muted">
                        {slotsData.options.find((o) => o.at === s)?.displayName}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
              {!slotsData?.slots?.length ? (
                <div className="space-y-3">
                  <div className="text-sm text-ink-muted">Немає вільних слотів на цю дату</div>
                  <p className="text-sm text-ink-muted">
                    Можете стати в лист очікування — ми повідомимо, коли зʼявиться місце.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className="input"
                      placeholder="Імʼя"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Телефон +380..."
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <ErrorText error={error} />
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    disabled={
                      joinWaitlist.isPending || !form.firstName || form.phone.length < 9
                    }
                    onClick={() => joinWaitlist.mutate()}
                  >
                    Стати в лист очікування
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Ваші контакти</h1>
              <div className="rounded-xl bg-cream p-3 text-sm">
                {selectedBranch ? (
                  <div className="mb-1 text-ink-muted">{selectedBranch.name}</div>
                ) : null}
                <div>{selectedServices.map((s: any) => s.name).join(' + ')}</div>
                <div className="text-ink-muted">
                  {staffId === ANY_MASTER ? 'Будь-який майстер' : selectedStaff?.displayName} ·{' '}
                  {slot ? formatDateTime(slot) : ''} · {durationMin} хв
                </div>
                <div className="mt-1 font-semibold">{formatMoney(totalPrice)}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Імʼя">
                  <input
                    className="input"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </Field>
                <Field label="Прізвище">
                  <input
                    className="input"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Телефон">
                <input
                  className="input"
                  required
                  placeholder="+380..."
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="Email (опційно)">
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Коментар">
                <textarea
                  className="input min-h-16"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
              {salon?.depositEnabled || salon?.liqpayEnabled ? (
                <label className="flex items-start gap-2 rounded-xl border border-border bg-cream p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={payDeposit || !!salon?.depositRequired}
                    disabled={!!salon?.depositRequired}
                    onChange={(e) => setPayDeposit(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">
                      {salon?.depositRequired ? 'Депозит обовʼязковий' : 'Сплатити депозит онлайн'}
                    </span>
                    <span className="mt-0.5 block text-ink-muted">
                      {salon?.depositPercent || 30}% від вартості (
                      {formatMoney((totalPrice * (salon?.depositPercent || 30)) / 100)})
                    </span>
                  </span>
                </label>
              ) : null}
              <input
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
              <ErrorText error={error} />
            </div>
          )}

          {step === 5 && done && (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 text-emerald-600" size={48} />
              <h1 className="text-2xl font-bold">
                {paymentResult ? 'Повернення з оплати' : 'Готово!'}
              </h1>
              <p className="mt-2 text-ink-muted">{done.message}</p>
              {done.appointment ? (
                <div className="mx-auto mt-6 max-w-sm rounded-xl bg-cream p-4 text-sm">
                  <div className="font-medium">{formatDateTime(done.appointment.startAt)}</div>
                  <div>{done.appointment.staff?.displayName}</div>
                  <div className="text-ink-muted">
                    {done.appointment.services?.map((s: any) => s.nameSnapshot).join(' → ')}
                  </div>
                  {selectedRoom || done.appointment.room?.name ? (
                    <div className="text-xs text-ink-muted">
                      🚪 {selectedRoom?.name || done.appointment.room?.name}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {done.appointment?.startAt ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <a
                    className="btn btn-ghost text-sm"
                    href={googleCalendarUrl({
                      title: `Master of Beauty · ${selectedServices.map((s: any) => s.name).join(', ') || 'Візит'}`,
                      startAt: done.appointment.startAt,
                      endAt: done.appointment.endAt,
                      details: `${done.appointment.staff?.displayName || ''} · ${
                        done.appointment.services?.map((s: any) => s.nameSnapshot).join(', ') || ''
                      }`,
                      location: selectedBranch?.address || salon?.address || '',
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Calendar
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    onClick={() => {
                      const blob = appointmentIcsBlob({
                        title: `Master of Beauty · ${selectedServices.map((s: any) => s.name).join(', ') || 'Візит'}`,
                        startAt: done.appointment.startAt,
                        endAt: done.appointment.endAt,
                        description: done.appointment.staff?.displayName || '',
                        location: selectedBranch?.address || '',
                        uid: done.appointment.id,
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'beauty-appointment.ics';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Apple / .ics
                  </button>
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href="/my" className="btn btn-secondary">
                  Мій кабінет
                </Link>
                <Link href="/" className="btn btn-primary">
                  На головну
                </Link>
              </div>
            </div>
          )}

          {step < 5 ? (
            <div className="mt-8 hidden justify-between gap-3 sm:flex">
              <button
                className="btn btn-secondary"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Назад
              </button>
              {step < 4 ? (
                <button
                  className="btn btn-primary"
                  disabled={!canNext}
                  onClick={() => {
                    if (step === 0 && !branchId && salon?.branches?.length) {
                      const def =
                        salon.branches.find((b: any) => b.isDefault) || salon.branches[0];
                      setBranchId(def.id);
                    }
                    setStep((s) => s + 1);
                  }}
                >
                  Далі
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!canNext || book.isPending}
                  onClick={() => book.mutate()}
                >
                  {book.isPending
                    ? 'Запис...'
                    : payDeposit || salon?.depositRequired
                      ? 'Записатись і сплатити депозит'
                      : 'Підтвердити запис'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {step < 5 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur sm:hidden">
          <div className="mb-2 flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{stickyLabel}</div>
              <div className="text-xs text-ink-muted">
                {durationMin ? `${durationMin} хв · ` : ''}
                {totalPrice ? formatMoney(totalPrice) : '—'}
              </div>
            </div>
            {serviceIds.length ? (
              <button className="btn btn-ghost p-1" onClick={() => setServiceIds([])} aria-label="Очистити">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary flex-1"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Назад
            </button>
            {step < 4 ? (
              <button
                className="btn btn-primary flex-[2]"
                disabled={!canNext}
                onClick={() => {
                  if (step === 0 && !branchId && salon?.branches?.length) {
                    const def =
                      salon.branches.find((b: any) => b.isDefault) || salon.branches[0];
                    setBranchId(def.id);
                  }
                  setStep((s) => s + 1);
                }}
              >
                Продовжити
              </button>
            ) : (
              <button
                className="btn btn-primary flex-[2]"
                disabled={!canNext || book.isPending}
                onClick={() => book.mutate()}
              >
                {book.isPending ? 'Запис...' : 'Підтвердити'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
