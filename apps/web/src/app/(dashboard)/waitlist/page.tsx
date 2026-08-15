'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarPlus, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatTime } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function WaitlistPage() {
  const { branchId } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bookEntry, setBookEntry] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    serviceId: '',
    staffId: '',
    preferredDate: '',
    preferredTimeFrom: '10:00',
    preferredTimeTo: '18:00',
    notes: '',
  });
  const [bookForm, setBookForm] = useState({
    staffId: '',
    serviceIds: [] as string[],
    date: format(new Date(), 'yyyy-MM-dd'),
    slot: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['waitlist', branchId],
    queryFn: () => api<any[]>('/waitlist'),
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
  const { data: staff } = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api<any[]>('/staff'),
  });

  const slotsQuery = useQuery({
    queryKey: ['wl-slots', bookForm.staffId, bookForm.date, bookForm.serviceIds.join(',')],
    queryFn: () =>
      api<{ slots: string[] }>(
        `/appointments/slots?staffId=${bookForm.staffId}&date=${bookForm.date}&serviceIds=${bookForm.serviceIds.join(',')}`,
      ),
    enabled:
      !!bookEntry &&
      !!bookForm.staffId &&
      !!bookForm.date &&
      bookForm.serviceIds.length > 0,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          branchId,
          serviceId: form.serviceId || undefined,
          staffId: form.staffId || undefined,
          preferredDate: form.preferredDate || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/waitlist/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const book = useMutation({
    mutationFn: () =>
      api(`/waitlist/${bookEntry.id}/book`, {
        method: 'POST',
        body: JSON.stringify({
          staffId: bookForm.staffId,
          startAt: bookForm.slot,
          serviceIds: bookForm.serviceIds,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setBookEntry(null);
      setError(null);
      alert('Клієнта записано з листа очікування');
    },
    onError: (e: Error) => setError(e.message),
  });

  const statusBadge = useMemo(
    () =>
      ({
        WAITING: 'bg-amber-100 text-amber-800',
        NOTIFIED: 'bg-sky-100 text-sky-800',
        BOOKED: 'bg-emerald-100 text-emerald-800',
        CANCELLED: 'bg-slate-100 text-slate-600',
      }) as Record<string, string>,
    [],
  );

  function openBook(entry: any) {
    setBookEntry(entry);
    setError(null);
    setBookForm({
      staffId: entry.staffId || staff?.[0]?.id || '',
      serviceIds: entry.serviceId ? [entry.serviceId] : [],
      date: entry.preferredDate
        ? format(new Date(entry.preferredDate), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd'),
      slot: '',
    });
  }

  return (
    <div>
      <PageHeader
        title="Лист очікування"
        subtitle="Клієнти, які чекають на вільне місце · можна одразу записати"
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Додати
          </button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Клієнт</th>
                <th>Послуга</th>
                <th>Майстер</th>
                <th>Бажана дата</th>
                <th>Час</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((w) => (
                <tr key={w.id}>
                  <td className="font-medium">
                    {w.client.firstName} {w.client.lastName || ''}
                    <div className="text-xs text-ink-muted">{w.client.phone}</div>
                  </td>
                  <td>{w.service?.name || '—'}</td>
                  <td>{w.staff?.displayName || 'Будь-хто'}</td>
                  <td>
                    {w.preferredDate
                      ? new Date(w.preferredDate).toLocaleDateString('uk-UA')
                      : '—'}
                  </td>
                  <td>
                    {w.preferredTimeFrom || '—'}–{w.preferredTimeTo || '—'}
                  </td>
                  <td>
                    <span className={`badge ${statusBadge[w.status] || 'bg-cream'}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="space-x-1 whitespace-nowrap">
                    {w.status === 'WAITING' || w.status === 'NOTIFIED' ? (
                      <button
                        className="btn btn-primary px-2 py-1 text-xs"
                        onClick={() => openBook(w)}
                      >
                        <CalendarPlus size={12} /> Записати
                      </button>
                    ) : null}
                    {w.status === 'WAITING' ? (
                      <button
                        className="btn btn-secondary px-2 py-1 text-xs"
                        onClick={() => update.mutate({ id: w.id, status: 'NOTIFIED' })}
                      >
                        Повідомити
                      </button>
                    ) : null}
                    {w.status !== 'CANCELLED' && w.status !== 'BOOKED' ? (
                      <button
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => update.mutate({ id: w.id, status: 'CANCELLED' })}
                      >
                        Скасувати
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!data?.length ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-muted">
                    Лист очікування порожній
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Додати в лист очікування">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
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
                  {c.firstName} {c.lastName || ''} · {c.phone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Послуга">
            <select
              className="input"
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            >
              <option value="">Будь-яка</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Майстер">
            <select
              className="input"
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            >
              <option value="">Будь-хто</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Бажана дата">
            <input
              className="input"
              type="date"
              value={form.preferredDate}
              onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="З">
              <input
                className="input"
                type="time"
                value={form.preferredTimeFrom}
                onChange={(e) => setForm({ ...form, preferredTimeFrom: e.target.value })}
              />
            </Field>
            <Field label="До">
              <input
                className="input"
                type="time"
                value={form.preferredTimeTo}
                onChange={(e) => setForm({ ...form, preferredTimeTo: e.target.value })}
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
            Зберегти
          </button>
        </form>
      </Modal>

      <Modal
        open={!!bookEntry}
        onClose={() => setBookEntry(null)}
        title={
          bookEntry
            ? `Записати: ${bookEntry.client.firstName} ${bookEntry.client.lastName || ''}`
            : 'Записати'
        }
        wide
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bookForm.slot) {
              setError('Оберіть слот');
              return;
            }
            if (!bookForm.serviceIds.length) {
              setError('Оберіть послуги');
              return;
            }
            book.mutate();
          }}
        >
          <Field label="Майстер">
            <select
              className="input"
              required
              value={bookForm.staffId}
              onChange={(e) => setBookForm({ ...bookForm, staffId: e.target.value, slot: '' })}
            >
              <option value="">Оберіть...</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Послуги">
            <div className="max-h-36 space-y-1 overflow-auto rounded-xl border border-border p-2">
              {services?.map((s) => {
                const checked = bookForm.serviceIds.includes(s.id);
                return (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setBookForm({
                          ...bookForm,
                          slot: '',
                          serviceIds: checked
                            ? bookForm.serviceIds.filter((id) => id !== s.id)
                            : [...bookForm.serviceIds, s.id],
                        })
                      }
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Дата">
            <input
              className="input"
              type="date"
              value={bookForm.date}
              onChange={(e) => setBookForm({ ...bookForm, date: e.target.value, slot: '' })}
            />
          </Field>
          <Field label="Вільні слоти">
            {slotsQuery.isLoading ? (
              <div className="text-sm text-ink-muted">Завантаження...</div>
            ) : !slotsQuery.data?.slots?.length ? (
              <div className="text-sm text-ink-muted">Немає вільних слотів</div>
            ) : (
              <div className="grid max-h-40 grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
                {slotsQuery.data.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`rounded-xl border px-2 py-2 text-sm font-medium ${
                      bookForm.slot === slot ? 'border-rose bg-rose-soft' : 'border-border'
                    }`}
                    onClick={() => setBookForm({ ...bookForm, slot })}
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={book.isPending}>
            Підтвердити запис
          </button>
        </form>
      </Modal>
    </div>
  );
}
