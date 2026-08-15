'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';
import { EmptyState, ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  allergies: '',
  preferences: '',
  notes: '',
};

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: () =>
      api<{ items: any[] }>(`/clients?search=${encodeURIComponent(search)}&limit=50`),
  });

  const detail = useQuery({
    queryKey: ['client', selected?.id],
    queryFn: () => api<any>(`/clients/${selected.id}`),
    enabled: !!selected?.id,
  });

  const timeline = useQuery({
    queryKey: ['client-timeline', selected?.id],
    queryFn: () => api<any>(`/clients/${selected.id}/timeline`),
    enabled: !!selected?.id,
  });

  const client = detail.data;
  const loyalty = useMemo(() => client?.loyalty, [client]);

  useEffect(() => {
    if (client && editing) {
      setForm({
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        phone: client.phone || '',
        email: client.email || '',
        allergies: client.allergies || '',
        preferences: client.preferences || '',
        notes: client.notes || '',
      });
    }
  }, [client, editing]);

  const create = useMutation({
    mutationFn: () => api('/clients', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setOpen(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/clients/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', selected.id] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      api(`/clients/${selected.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', selected.id] });
      setNote('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const items = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Клієнти"
        subtitle="Картки клієнтів, історія та бонуси"
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm(emptyForm);
              setError(null);
              setOpen(true);
            }}
          >
            <Plus size={16} /> Новий клієнт
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-2 card px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          className="w-full border-0 bg-transparent outline-none"
          placeholder="Пошук за імʼям або телефоном..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title="Клієнтів не знайдено" text="Додайте першого клієнта" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Імʼя</th>
                <th>Телефон</th>
                <th>Бонуси</th>
                <th>Візити</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(c);
                    setEditing(false);
                    setError(null);
                    setNote('');
                  }}
                >
                  <td className="font-medium">
                    {c.firstName} {c.lastName || ''}
                  </td>
                  <td>{c.phone}</td>
                  <td>{Number(c.loyalty?.pointsBalance || 0)}</td>
                  <td>{c._count?.appointments ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Новий клієнт">
        <ClientForm
          form={form}
          setForm={setForm}
          error={error}
          submitting={create.isPending}
          onSubmit={() => create.mutate()}
        />
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setEditing(false);
        }}
        title={selected ? `${selected.firstName} ${selected.lastName || ''}` : ''}
        wide
      >
        {!client ? (
          <LoadingBlock />
        ) : editing ? (
          <ClientForm
            form={form}
            setForm={setForm}
            error={error}
            submitting={update.isPending}
            onSubmit={() => update.mutate()}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                Редагувати
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">Телефон</div>
                <div className="font-medium">{client.phone}</div>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">Бонуси</div>
                <div className="font-medium">{Number(loyalty?.pointsBalance || 0)}</div>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">Рівень</div>
                <div className="font-medium">{loyalty?.tier || 'BRONZE'}</div>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">LTV</div>
                <div className="font-medium">
                  {formatMoney(timeline.data?.metrics?.ltv || 0)}
                </div>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">Візитів</div>
                <div className="font-medium">{timeline.data?.metrics?.visits ?? '—'}</div>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <div className="text-xs text-ink-muted">Середній чек</div>
                <div className="font-medium">
                  {formatMoney(timeline.data?.metrics?.avgCheck || 0)}
                </div>
              </div>
            </div>

            {timeline.data?.timeline?.length ? (
              <div>
                <h3 className="mb-2 font-semibold">Timeline 360</h3>
                <div className="max-h-48 space-y-2 overflow-auto">
                  {timeline.data.timeline.slice(0, 25).map((e: any, i: number) => (
                    <div
                      key={`${e.type}-${e.at}-${i}`}
                      className="flex gap-3 rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <span className="shrink-0 text-xs text-ink-muted">
                        {new Date(e.at).toLocaleString('uk-UA')}
                      </span>
                      <span className="badge shrink-0 text-[10px]">{e.type}</span>
                      <span className="min-w-0 flex-1">{e.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {client.email ? (
              <div className="text-sm text-ink-muted">Email: {client.email}</div>
            ) : null}
            {client.allergies ? (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Алергії: {client.allergies}
              </div>
            ) : null}
            {client.preferences ? (
              <div className="rounded-xl bg-cream px-3 py-2 text-sm">
                Уподобання: {client.preferences}
              </div>
            ) : null}

            {client.packages?.length ? (
              <div>
                <h3 className="mb-2 font-semibold">Абонементи</h3>
                <div className="space-y-2">
                  {client.packages.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-ink-muted">
                          {p.sessionsLeft}/{p.sessionsTotal} сеансів · {p.status}
                          {p.template?.service?.name ? ` · ${p.template.service.name}` : ''}
                          {p.expiresAt
                            ? ` · до ${new Date(p.expiresAt).toLocaleDateString('uk-UA')}`
                            : ''}
                        </div>
                      </div>
                      <span className="font-semibold">{formatMoney(p.pricePaid)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 font-semibold">Нотатки</h3>
              <div className="mb-2 flex gap-2">
                <input
                  className="input"
                  placeholder="Додати нотатку..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  className="btn btn-secondary shrink-0"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate()}
                >
                  Додати
                </button>
              </div>
              <div className="max-h-36 space-y-2 overflow-auto">
                {client.notesList?.length ? (
                  client.notesList.map((n: any) => (
                    <div key={n.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                      <div>{n.body}</div>
                      <div className="mt-1 text-xs text-ink-muted">
                        {new Date(n.createdAt).toLocaleString('uk-UA')}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-muted">Нотаток ще немає</div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Історія візитів</h3>
              <div className="space-y-2">
                {client.appointments?.length ? (
                  client.appointments.map((a: any) => (
                    <div key={a.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                      <div className="font-medium">
                        {a.services.map((s: any) => s.nameSnapshot).join(', ')}
                      </div>
                      <div className="text-ink-muted">
                        {new Date(a.startAt).toLocaleString('uk-UA')} · {a.staff.displayName} ·{' '}
                        {a.status}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-muted">Візитів ще немає</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Останні чеки</h3>
              {client.sales?.length ? (
                client.sales.map((s: any) => (
                  <div key={s.id} className="flex justify-between border-b border-border py-2 text-sm">
                    <span>{s.number}</span>
                    <span className="font-medium">{formatMoney(s.total)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-ink-muted">Покупок ще немає</div>
              )}
            </div>
            <ErrorText error={error} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ClientForm({
  form,
  setForm,
  error,
  submitting,
  onSubmit,
  onCancel,
}: {
  form: typeof emptyForm;
  setForm: (v: typeof emptyForm) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
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
      <Field label="Email">
        <input
          className="input"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Алергії">
        <input
          className="input"
          value={form.allergies}
          onChange={(e) => setForm({ ...form, allergies: e.target.value })}
        />
      </Field>
      <Field label="Уподобання">
        <textarea
          className="input min-h-20"
          value={form.preferences}
          onChange={(e) => setForm({ ...form, preferences: e.target.value })}
        />
      </Field>
      <Field label="Загальні нотатки">
        <textarea
          className="input min-h-16"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        {onCancel ? (
          <button type="button" className="btn btn-secondary flex-1" onClick={onCancel}>
            Скасувати
          </button>
        ) : null}
        <button className="btn btn-primary flex-1" disabled={submitting}>
          Зберегти
        </button>
      </div>
    </form>
  );
}
