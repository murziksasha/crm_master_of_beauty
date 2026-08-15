'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { publicApi } from '@/lib/api';
import {
  appointmentIcsBlob,
  formatDateTime,
  formatMoney,
  formatTime,
  googleCalendarUrl,
} from '@/lib/utils';
import { ErrorText, Field } from '@/components/ui';

export default function BookPage() {
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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
    queryKey: ['public-staff', serviceId, branchId],
    queryFn: () => publicApi.staff(serviceId || undefined, branchId || undefined),
    enabled: !!serviceId,
  });
  const { data: slotsData } = useQuery({
    queryKey: ['public-slots', staffId, date, serviceId],
    queryFn: () => publicApi.slots(staffId, date, serviceId),
    enabled: !!staffId && !!date && !!serviceId,
  });
  const { data: rooms } = useQuery({
    queryKey: ['public-rooms', branchId],
    queryFn: () => publicApi.rooms(branchId || undefined),
    enabled: !!branchId || !!salon,
  });

  const selectedCategory = categories?.find((c: any) => c.id === categoryId);
  const selectedService = selectedCategory?.services?.find((s: any) => s.id === serviceId);
  const selectedStaff = staff?.find((s: any) => s.id === staffId);
  const selectedBranch = salon?.branches?.find((b: any) => b.id === branchId);
  const selectedRoom = rooms?.find((r: any) => r.id === roomId);

  const book = useMutation({
    mutationFn: () =>
      publicApi.book({
        ...form,
        staffId,
        startAt: slot,
        serviceIds: [serviceId],
        branchId: branchId || undefined,
        roomId: roomId || undefined,
        payDeposit: payDeposit || salon?.depositRequired,
      }),
    onSuccess: (res: any) => {
      setDone(res);
      setStep(5);
      setError(null);
      // Auto-submit LiqPay checkout if real payment form
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

  const mockPay = useMutation({
    mutationFn: (appointmentId: string) => publicApi.mockDeposit(appointmentId),
    onSuccess: (res: any) => {
      setDone((d: any) => ({
        ...d,
        message: `Депозит ${res.depositAmount} ₴ зараховано (mock). Запис підтверджено!`,
        appointment: d?.appointment
          ? {
              ...d.appointment,
              status: 'CONFIRMED',
              depositPaidAt: new Date().toISOString(),
              depositAmount: res.depositAmount,
            }
          : d?.appointment,
        payment: null,
      }));
      setError(null);
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
        serviceId: serviceId || undefined,
        staffId: staffId || undefined,
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
    if (step === 1) return !!serviceId;
    if (step === 2) return !!staffId;
    if (step === 3) return !!slot;
    if (step === 4) return form.firstName && form.phone.length >= 9;
    return false;
  }, [step, serviceId, staffId, slot, form, branchId, salon]);

  return (
    <div className="min-h-screen bg-cream">
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
                      setStaffId('');
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
              <h1 className="text-2xl font-bold">Оберіть послугу</h1>
              {categories?.map((cat: any) => (
                <div key={cat.id}>
                  <div className="mb-2 text-sm font-semibold text-ink-muted">{cat.name}</div>
                  <div className="space-y-2">
                    {cat.services.map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          serviceId === s.id
                            ? 'border-rose bg-rose-soft'
                            : 'border-border hover:border-gold'
                        }`}
                        onClick={() => {
                          setCategoryId(cat.id);
                          setServiceId(s.id);
                          setStaffId('');
                          setSlot('');
                        }}
                      >
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-ink-muted">{s.durationMin} хв</div>
                        </div>
                        <div className="font-semibold">{formatMoney(s.price)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Оберіть майстра</h1>
              <p className="text-sm text-ink-muted">
                Послуга: <strong>{selectedService?.name}</strong>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {staff?.map((s: any) => (
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
                {selectedStaff?.displayName} · {selectedService?.name}
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
              <Field label="Дата">
                <input
                  className="input"
                  type="date"
                  value={date}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot('');
                  }}
                />
              </Field>
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
                <div>{selectedService?.name}</div>
                <div className="text-ink-muted">
                  {selectedStaff?.displayName} · {slot ? formatDateTime(slot) : ''}
                </div>
                <div className="mt-1 font-semibold">{formatMoney(selectedService?.price)}</div>
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
                      {formatMoney(
                        ((Number(selectedService?.price) || 0) * (salon?.depositPercent || 30)) /
                          100,
                      )}
                      ) — захист від неявки, LiqPay
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
              {paymentResult?.order ? (
                <p className="mt-1 text-xs text-ink-muted">Order: {paymentResult.order}</p>
              ) : null}
              {done.appointment ? (
                <div className="mx-auto mt-6 max-w-sm rounded-xl bg-cream p-4 text-sm">
                  <div className="font-medium">{formatDateTime(done.appointment.startAt)}</div>
                  <div>{done.appointment.staff?.displayName}</div>
                  <div className="text-ink-muted">
                    {done.appointment.services?.map((s: any) => s.nameSnapshot).join(', ')}
                  </div>
                  {selectedRoom || done.appointment.room?.name ? (
                    <div className="text-xs text-ink-muted">
                      🚪 {selectedRoom?.name || done.appointment.room?.name}
                    </div>
                  ) : null}
                  {done.appointment.depositAmount && !done.appointment.depositPaidAt ? (
                    <div className="mt-2 text-amber-800">
                      Депозит: {formatMoney(done.appointment.depositAmount)}
                      {done.payment?.form ? ' · перенаправлення на LiqPay…' : ''}
                    </div>
                  ) : null}
                  {done.appointment.depositPaidAt ? (
                    <div className="mt-2 font-medium text-emerald-700">
                      Депозит сплачено · {formatMoney(done.appointment.depositAmount)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {done.appointment &&
              done.appointment.depositAmount &&
              !done.appointment.depositPaidAt &&
              (done.payment?.mock || done.mockDepositAllowed) ? (
                <button
                  className="btn btn-secondary mt-4"
                  disabled={mockPay.isPending}
                  onClick={() => mockPay.mutate(done.appointment.id)}
                >
                  {mockPay.isPending ? 'Оплата…' : 'Сплатити депозит (mock / dev)'}
                </button>
              ) : null}
              {done.appointment?.startAt ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <a
                    className="btn btn-ghost text-sm"
                    href={googleCalendarUrl({
                      title: `Master of Beauty · ${selectedService?.name || 'Візит'}`,
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
                        title: `Master of Beauty · ${selectedService?.name || 'Візит'}`,
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
                    .ics файл
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
            <div className="mt-8 flex justify-between gap-3">
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
    </div>
  );
}
