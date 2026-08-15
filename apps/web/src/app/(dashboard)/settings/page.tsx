'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ErrorText, Field, LoadingBlock, PageHeader } from '@/components/ui';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    autoConfirmOnline: true,
    loyaltyEarnPercent: 5,
    slotStepMin: 15,
    smsProvider: 'MOCK',
    smsSender: '',
    smsEnabled: true,
    liqpayPublicKey: '',
    liqpayPrivateKey: '',
    liqpaySandbox: true,
    liqpayEnabled: false,
    publicBaseUrl: 'http://localhost',
    depositEnabled: false,
    depositRequired: false,
    depositPercent: 30,
  });
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [roomForm, setRoomForm] = useState({ name: '', capacity: 1, color: '#A78BFA' });

  const { data, isLoading } = useQuery({
    queryKey: ['salon'],
    queryFn: () => api<any>('/salon'),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches-all'],
    queryFn: () => api<any[]>('/branches?all=1'),
  });
  const { data: smsLogs } = useQuery({
    queryKey: ['sms-logs'],
    queryFn: () => api<any[]>('/salon/sms-logs?limit=30'),
  });
  const { data: auditLogs } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api<any[]>('/audit?limit=40'),
  });
  const { data: rooms } = useQuery({
    queryKey: ['rooms-all'],
    queryFn: () => api<any[]>('/rooms?all=1'),
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        autoConfirmOnline: data.autoConfirmOnline,
        loyaltyEarnPercent: data.loyaltyEarnPercent,
        slotStepMin: data.slotStepMin,
        smsProvider: data.smsProvider || 'MOCK',
        smsSender: data.smsSender || '',
        smsEnabled: data.smsEnabled ?? true,
        liqpayPublicKey: data.liqpayPublicKey || '',
        liqpayPrivateKey: '',
        liqpaySandbox: data.liqpaySandbox ?? true,
        liqpayEnabled: data.liqpayEnabled ?? false,
        publicBaseUrl: data.publicBaseUrl || 'http://localhost',
        depositEnabled: data.depositEnabled ?? false,
        depositRequired: data.depositRequired ?? false,
        depositPercent: data.depositPercent ?? 30,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        loyaltyEarnPercent: Number(form.loyaltyEarnPercent),
        slotStepMin: Number(form.slotStepMin),
      };
      if (!payload.liqpayPrivateKey) delete payload.liqpayPrivateKey;
      return api('/salon', { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salon'] });
      setOk(true);
      setError(null);
      setTimeout(() => setOk(false), 2000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const createBranch = useMutation({
    mutationFn: () =>
      api('/branches', {
        method: 'POST',
        body: JSON.stringify(branchForm),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches-all'] });
      setBranchForm({ name: '', address: '', phone: '' });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createRoom = useMutation({
    mutationFn: () =>
      api('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: roomForm.name,
          capacity: Number(roomForm.capacity) || 1,
          color: roomForm.color,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms-all'] });
      setRoomForm({ name: '', capacity: 1, color: '#A78BFA' });
    },
    onError: (e: Error) => setError(e.message),
  });

  const runJobs = useMutation({
    mutationFn: () => api('/jobs/run-daily', { method: 'POST', body: '{}' }),
    onSuccess: (res: any) => {
      setOk(true);
      setError(null);
      setTimeout(() => setOk(false), 3000);
      alert(
        `Jobs: staff=${res.staff?.sent ?? 0}, birthdays=${res.birthdays?.count ?? 0}, lowStock=${res.lowStock?.count ?? 0}`,
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Налаштування" subtitle="Салон, філії, SMS, LiqPay" />

      <form
        className="card mb-6 max-w-3xl space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-semibold">Основне</h2>
        <Field label="Назва салону">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Адреса (головна)">
          <input
            className="input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Телефон">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Крок слотів (хв)">
            <input
              className="input"
              type="number"
              value={form.slotStepMin}
              onChange={(e) => setForm({ ...form, slotStepMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="Бонуси % від чека">
            <input
              className="input"
              type="number"
              value={form.loyaltyEarnPercent}
              onChange={(e) => setForm({ ...form, loyaltyEarnPercent: Number(e.target.value) })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoConfirmOnline}
            onChange={(e) => setForm({ ...form, autoConfirmOnline: e.target.checked })}
          />
          Автопідтвердження онлайн-записів
        </label>

        <h2 className="pt-4 font-semibold">SMS</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Провайдер">
            <select
              className="input"
              value={form.smsProvider}
              onChange={(e) => setForm({ ...form, smsProvider: e.target.value })}
            >
              <option value="MOCK">Mock (логи)</option>
              <option value="TURBOSMS">TurboSMS</option>
              <option value="ALPHASMS">AlphaSMS</option>
            </select>
          </Field>
          <Field label="Sender / альфа-імʼя">
            <input
              className="input"
              value={form.smsSender}
              onChange={(e) => setForm({ ...form, smsSender: e.target.value })}
              placeholder="BeautyCRM"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.smsEnabled}
            onChange={(e) => setForm({ ...form, smsEnabled: e.target.checked })}
          />
          SMS увімкнено
        </label>
        <p className="text-xs text-ink-muted">
          Env: <code>SMS_PROVIDER</code>, <code>TURBOSMS_TOKEN</code> / <code>ALPHASMS_API_KEY</code>,{' '}
          <code>SMS_SENDER</code>
        </p>

        <h2 className="pt-4 font-semibold">Депозит (no-show)</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.depositEnabled}
              onChange={(e) => setForm({ ...form, depositEnabled: e.target.checked })}
            />
            Депозит увімкнено
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.depositRequired}
              onChange={(e) => setForm({ ...form, depositRequired: e.target.checked })}
            />
            Обовʼязковий для онлайн-запису
          </label>
        </div>
        <Field label="% депозиту">
          <input
            className="input"
            type="number"
            min={5}
            max={100}
            value={form.depositPercent}
            onChange={(e) => setForm({ ...form, depositPercent: Number(e.target.value) })}
          />
        </Field>

        <h2 className="pt-4 font-semibold">LiqPay</h2>
        <Field label="Public key">
          <input
            className="input"
            value={form.liqpayPublicKey}
            onChange={(e) => setForm({ ...form, liqpayPublicKey: e.target.value })}
          />
        </Field>
        <Field label="Private key (залиште порожнім, щоб не змінювати)">
          <input
            className="input"
            type="password"
            value={form.liqpayPrivateKey}
            onChange={(e) => setForm({ ...form, liqpayPrivateKey: e.target.value })}
            placeholder={data?.hasLiqpayPrivateKey ? '•••• збережено' : ''}
          />
        </Field>
        <Field label="Public base URL (для callback)">
          <input
            className="input"
            value={form.publicBaseUrl}
            onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.liqpayEnabled}
              onChange={(e) => setForm({ ...form, liqpayEnabled: e.target.checked })}
            />
            LiqPay увімкнено
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.liqpaySandbox}
              onChange={(e) => setForm({ ...form, liqpaySandbox: e.target.checked })}
            />
            Sandbox
          </label>
        </div>

        <ErrorText error={error} />
        {ok ? (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Збережено
          </div>
        ) : null}
        <button className="btn btn-primary" disabled={save.isPending}>
          Зберегти
        </button>
      </form>

      <section className="card mb-6 max-w-3xl space-y-3 p-6">
        <h2 className="font-semibold">Фонові jobs (ops)</h2>
        <p className="text-sm text-ink-muted">
          Щодня о 08:05 (Kyiv): дайджест майстрам, вітання з ДН, low-stock. Тут — ручний запуск.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={runJobs.isPending}
          onClick={() => runJobs.mutate()}
        >
          {runJobs.isPending ? 'Запуск…' : 'Запустити daily jobs зараз'}
        </button>
      </section>

      <section className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold">Філії</h2>
        <div className="space-y-2">
          {(branches || []).map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {b.name} {b.isDefault ? '· default' : ''}
                </div>
                <div className="text-ink-muted">{b.address || '—'}</div>
              </div>
              <span className={`badge ${b.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100'}`}>
                {b.isActive ? 'Активна' : 'Вимкнена'}
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Назва">
            <input
              className="input"
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
            />
          </Field>
          <Field label="Адреса">
            <input
              className="input"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
            />
          </Field>
          <Field label="Телефон">
            <input
              className="input"
              value={branchForm.phone}
              onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
            />
          </Field>
        </div>
        <button
          className="btn btn-secondary"
          disabled={!branchForm.name || createBranch.isPending}
          onClick={() => createBranch.mutate()}
        >
          Додати філію
        </button>
      </section>

      <section className="card mt-6 max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold">Кабінети / rooms</h2>
        <div className="space-y-2">
          {(rooms || []).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                <span className="font-medium">{r.name}</span>
                <span className="text-ink-muted">· місць {r.capacity}</span>
              </div>
              <span className={`badge ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100'}`}>
                {r.isActive ? 'Активний' : 'Вимкнений'}
              </span>
            </div>
          ))}
          {!rooms?.length ? (
            <div className="text-sm text-ink-muted">Кабінетів ще немає</div>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Назва">
            <input
              className="input"
              value={roomForm.name}
              onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
              placeholder="Кабінет 1"
            />
          </Field>
          <Field label="Місткість">
            <input
              className="input"
              type="number"
              min={1}
              value={roomForm.capacity}
              onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })}
            />
          </Field>
          <Field label="Колір">
            <input
              className="input"
              type="color"
              value={roomForm.color}
              onChange={(e) => setRoomForm({ ...roomForm, color: e.target.value })}
            />
          </Field>
        </div>
        <button
          className="btn btn-secondary"
          disabled={!roomForm.name || createRoom.isPending}
          onClick={() => createRoom.mutate()}
        >
          Додати кабінет
        </button>
      </section>

      <section className="card mt-6 max-w-3xl space-y-3 p-6">
        <h2 className="font-semibold">Останні SMS</h2>
        <div className="max-h-72 space-y-2 overflow-auto">
          {(smsLogs || []).map((log) => (
            <div key={log.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">{log.to}</span>
                <span className="badge bg-cream text-ink">
                  {log.provider} · {log.status}
                </span>
              </div>
              <div className="mt-1 text-ink-muted">{log.body}</div>
              <div className="mt-1 text-xs text-ink-muted">
                {new Date(log.createdAt).toLocaleString('uk-UA')}
              </div>
            </div>
          ))}
          {!smsLogs?.length ? (
            <div className="text-sm text-ink-muted">SMS ще не надсилались</div>
          ) : null}
        </div>
      </section>

      <section className="card mt-6 max-w-3xl space-y-3 p-6">
        <h2 className="font-semibold">Журнал аудиту</h2>
        <div className="max-h-80 space-y-2 overflow-auto">
          {(auditLogs || []).map((log) => (
            <div key={log.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="badge bg-cream text-ink">
                  {log.action} · {log.entity}
                </span>
                <span className="text-xs text-ink-muted">
                  {new Date(log.createdAt).toLocaleString('uk-UA')}
                </span>
              </div>
              <div className="mt-1">{log.summary}</div>
              <div className="mt-1 text-xs text-ink-muted">
                {log.user
                  ? `${log.user.firstName} ${log.user.lastName || ''} · ${log.user.email}`
                  : 'система'}
                {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''}
              </div>
            </div>
          ))}
          {!auditLogs?.length ? (
            <div className="text-sm text-ink-muted">Подій ще немає</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
