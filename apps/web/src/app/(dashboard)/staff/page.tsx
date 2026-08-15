'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const colors = ['#C4787A', '#8B6F9E', '#E8A0BF', '#6B8E7F', '#D4A574', '#5B8FA8', '#B07D62'];

export default function StaffPage() {
  const { branchId, branch, branches } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: 'Master123!',
    firstName: '',
    lastName: '',
    phone: '',
    displayName: '',
    color: colors[0],
    specializations: '',
    commissionPct: 40,
    serviceIds: [] as string[],
    branchId: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api<any[]>('/staff'),
    enabled: !!branchId,
  });
  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => api<any[]>('/services'),
  });
  const detail = useQuery({
    queryKey: ['staff-detail', edit?.id],
    queryFn: () => api<any>(`/staff/${edit.id}`),
    enabled: !!edit?.id,
  });
  const [timeOff, setTimeOff] = useState({ startAt: '', endAt: '', reason: '' });

  const create = useMutation({
    mutationFn: () =>
      api('/staff', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || undefined,
          branchId: form.branchId || branchId || undefined,
          displayName: form.displayName || `${form.firstName} ${form.lastName[0] || ''}.`,
          color: form.color,
          commissionPct: Number(form.commissionPct),
          specializations: form.specializations
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          serviceIds: form.serviceIds,
          role: 'MASTER',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/staff/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || undefined,
          branchId: form.branchId || undefined,
          displayName: form.displayName,
          color: form.color,
          commissionPct: Number(form.commissionPct),
          specializations: form.specializations
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          serviceIds: form.serviceIds,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setEdit(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const addTimeOff = useMutation({
    mutationFn: () =>
      api(`/staff/${edit.id}/time-off`, {
        method: 'POST',
        body: JSON.stringify({
          startAt: new Date(timeOff.startAt).toISOString(),
          endAt: new Date(timeOff.endAt).toISOString(),
          reason: timeOff.reason || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-detail', edit.id] });
      setTimeOff({ startAt: '', endAt: '', reason: '' });
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeTimeOff = useMutation({
    mutationFn: (timeOffId: string) =>
      api(`/staff/${edit.id}/time-off/${timeOffId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-detail', edit.id] }),
  });

  function openCreate() {
    setForm({
      email: '',
      password: 'Master123!',
      firstName: '',
      lastName: '',
      phone: '',
      displayName: '',
      color: colors[Math.floor(Math.random() * colors.length)],
      specializations: '',
      commissionPct: 40,
      serviceIds: [],
      branchId: branchId || '',
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(s: any) {
    setForm({
      email: s.user.email,
      password: '',
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      phone: s.user.phone || '',
      displayName: s.displayName,
      color: s.color,
      specializations: (s.specializations || []).join(', '),
      commissionPct: s.commissionPct,
      serviceIds: (s.services || []).map((x: any) => x.serviceId || x.service?.id).filter(Boolean),
      branchId: s.branchId || '',
    });
    setError(null);
    setEdit(s);
  }

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Майстри"
        subtitle={branch ? `${branch.name} · команда` : 'Команда салону, спеціалізації та графік'}
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Додати майстра
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((s) => (
          <button
            key={s.id}
            type="button"
            className="card p-5 text-left transition hover:shadow-md"
            onClick={() => openEdit(s)}
          >
            <div className="mb-3 flex items-start gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                style={{ background: s.color }}
              >
                {s.displayName.slice(0, 1)}
              </div>
              <div>
                <div className="font-bold text-ink">{s.displayName}</div>
                <div className="text-sm text-ink-muted">
                  {s.user.firstName} {s.user.lastName}
                </div>
                {s.branch?.name ? (
                  <div className="mt-0.5 text-xs text-rose-dark">{s.branch.name}</div>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.specializations?.map((sp: string) => (
                    <span key={sp} className="badge bg-gold-soft text-ink">
                      {sp}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mb-3 text-sm text-ink-muted">
              Послуг: {s.services?.length || 0} · Комісія: {s.commissionPct}%
            </div>
            <div className="space-y-1 text-xs">
              {s.schedules
                ?.filter((d: any) => !d.isDayOff)
                .map((d: any) => (
                  <div key={d.id} className="flex justify-between rounded-lg bg-cream px-2 py-1">
                    <span>{dayNames[d.dayOfWeek]}</span>
                    <span>
                      {d.startTime}–{d.endTime}
                    </span>
                  </div>
                ))}
            </div>
          </button>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Новий майстер" wide>
        <StaffForm
          form={form}
          setForm={setForm}
          services={services || []}
          branches={branches}
          error={error}
          showAuth
          submitting={create.isPending}
          onSubmit={() => create.mutate()}
        />
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Редагувати майстра" wide>
        <div className="space-y-6">
          <StaffForm
            form={form}
            setForm={setForm}
            services={services || []}
            branches={branches}
            error={error}
            showAuth={false}
            submitting={update.isPending}
            onSubmit={() => update.mutate()}
          />
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 font-semibold">Вихідні / відпустка</h3>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <Field label="Початок">
                <input
                  className="input"
                  type="datetime-local"
                  value={timeOff.startAt}
                  onChange={(e) => setTimeOff({ ...timeOff, startAt: e.target.value })}
                />
              </Field>
              <Field label="Кінець">
                <input
                  className="input"
                  type="datetime-local"
                  value={timeOff.endAt}
                  onChange={(e) => setTimeOff({ ...timeOff, endAt: e.target.value })}
                />
              </Field>
              <Field label="Причина">
                <input
                  className="input"
                  value={timeOff.reason}
                  onChange={(e) => setTimeOff({ ...timeOff, reason: e.target.value })}
                  placeholder="Відпустка"
                />
              </Field>
            </div>
            <button
              className="btn btn-secondary mb-3"
              disabled={!timeOff.startAt || !timeOff.endAt || addTimeOff.isPending}
              onClick={() => addTimeOff.mutate()}
            >
              Додати time-off
            </button>
            <div className="space-y-2">
              {(detail.data?.timeOffs || []).map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {new Date(t.startAt).toLocaleString('uk-UA')} —{' '}
                      {new Date(t.endAt).toLocaleString('uk-UA')}
                    </div>
                    <div className="text-ink-muted">{t.reason || '—'}</div>
                  </div>
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() => removeTimeOff.mutate(t.id)}
                  >
                    Видалити
                  </button>
                </div>
              ))}
              {!detail.data?.timeOffs?.length ? (
                <div className="text-sm text-ink-muted">Немає запланованих вихідних</div>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StaffForm({
  form,
  setForm,
  services,
  branches,
  error,
  showAuth,
  submitting,
  onSubmit,
}: {
  form: any;
  setForm: (v: any) => void;
  services: any[];
  branches: { id: string; name: string }[];
  error: string | null;
  showAuth: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Філія">
        <select
          className="input"
          value={form.branchId}
          onChange={(e) => setForm({ ...form, branchId: e.target.value })}
        >
          <option value="">Не вказано</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      {showAuth ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">
            <input
              className="input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Пароль">
            <input
              className="input"
              type="text"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        </div>
      ) : null}
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
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Імʼя в календарі">
          <input
            className="input"
            value={form.displayName}
            placeholder="Марія К."
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </Field>
        <Field label="Телефон">
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Колір">
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                className={`h-8 w-8 rounded-full border-2 ${form.color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c })}
              />
            ))}
          </div>
        </Field>
        <Field label="Комісія %">
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.commissionPct}
            onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Спеціалізації (через кому)">
        <input
          className="input"
          placeholder="Стрижки, Укладки"
          value={form.specializations}
          onChange={(e) => setForm({ ...form, specializations: e.target.value })}
        />
      </Field>
      <Field label="Послуги майстра">
        <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-border p-2">
          {services.map((s) => {
            const checked = form.serviceIds.includes(s.id);
            return (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-cream">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setForm({
                      ...form,
                      serviceIds: checked
                        ? form.serviceIds.filter((id: string) => id !== s.id)
                        : [...form.serviceIds, s.id],
                    })
                  }
                />
                <span className="text-sm">{s.name}</span>
              </label>
            );
          })}
        </div>
      </Field>
      <ErrorText error={error} />
      <button className="btn btn-primary w-full" disabled={submitting}>
        Зберегти
      </button>
    </form>
  );
}
