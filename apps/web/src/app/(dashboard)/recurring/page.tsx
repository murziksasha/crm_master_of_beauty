'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatDateTime } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function RecurringPage() {
  const { branchId } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    staffId: '',
    serviceIds: [] as string[],
    startAt: `${format(new Date(), 'yyyy-MM-dd')}T10:00`,
    frequency: 'WEEKLY',
    occurrences: 8,
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recurring', branchId],
    queryFn: () => api<any[]>('/recurring'),
    enabled: !!branchId,
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: () => api<{ items: any[] }>('/clients?limit=100'),
  });
  const { data: staff } = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api<any[]>('/staff'),
  });
  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => api<any[]>('/services'),
  });

  const create = useMutation({
    mutationFn: () =>
      api('/recurring', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          branchId,
          startAt: new Date(form.startAt).toISOString(),
          occurrences: Number(form.occurrences),
        }),
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setOpen(false);
      setError(null);
      alert(
        `Створено ${res.createdCount} записів` +
          (res.skippedCount ? `, пропущено (конфлікти): ${res.skippedCount}` : ''),
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/recurring/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const freqLabel: Record<string, string> = {
    WEEKLY: 'Щотижня',
    BIWEEKLY: 'Раз на 2 тижні',
    MONTHLY: 'Щомісяця',
  };

  return (
    <div>
      <PageHeader
        title="Повторювані записи"
        subtitle="Серії візитів: щотижня / раз на 2 тижні / щомісяця"
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Нова серія
          </button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data || []).map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {s.client.firstName} {s.client.lastName || ''}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {s.staff.displayName} · {freqLabel[s.frequency] || s.frequency}
                  </div>
                  <div className="mt-1 text-sm">
                    Старт: {formatDateTime(s.startAt)} · {s.timeOfDay}
                  </div>
                  <div className="text-xs text-ink-muted">
                    Записів у серії: {s._count?.appointments ?? 0} · планово {s.occurrences}
                  </div>
                </div>
                <button
                  className="btn btn-danger px-2 py-1 text-xs"
                  onClick={() => {
                    if (confirm('Скасувати серію та майбутні записи?')) cancel.mutate(s.id);
                  }}
                >
                  Скасувати
                </button>
              </div>
            </div>
          ))}
          {!data?.length ? (
            <div className="card col-span-full p-8 text-center text-ink-muted">
              Повторюваних серій ще немає
            </div>
          ) : null}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Нова повторювана серія" wide>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.serviceIds.length) {
              setError('Оберіть послуги');
              return;
            }
            create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Клієнт">
              <select
                className="input"
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Оберіть...</option>
                {clients?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName || ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Майстер">
              <select
                className="input"
                required
                value={form.staffId}
                onChange={(e) => setForm({ ...form, staffId: e.target.value })}
              >
                <option value="">Оберіть...</option>
                {staff?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Послуги">
            <div className="max-h-36 space-y-1 overflow-auto rounded-xl border border-border p-2">
              {services?.map((s) => {
                const checked = form.serviceIds.includes(s.id);
                return (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 px-2 py-1">
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
                    <span className="text-sm">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Перший візит">
              <input
                className="input"
                type="datetime-local"
                required
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </Field>
            <Field label="Періодичність">
              <select
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="WEEKLY">Щотижня</option>
                <option value="BIWEEKLY">Раз на 2 тижні</option>
                <option value="MONTHLY">Щомісяця</option>
              </select>
            </Field>
            <Field label="К-сть візитів">
              <input
                className="input"
                type="number"
                min={1}
                max={52}
                value={form.occurrences}
                onChange={(e) => setForm({ ...form, occurrences: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Нотатка">
            <textarea
              className="input min-h-16"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={create.isPending}>
            Створити серію
          </button>
        </form>
      </Modal>
    </div>
  );
}
