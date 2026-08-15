'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function LoyaltyPage() {
  const qc = useQueryClient();
  const [giftOpen, setGiftOpen] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState(1000);
  const [pkgForm, setPkgForm] = useState({ clientId: '', templateId: '' });
  const [tplForm, setTplForm] = useState({
    name: '',
    sessionsTotal: 5,
    price: 2000,
    validityDays: 90,
    serviceId: '',
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['loyalty-accounts'],
    queryFn: () => api<any[]>('/loyalty/accounts'),
  });
  const { data: templates } = useQuery({
    queryKey: ['package-templates'],
    queryFn: () => api<any[]>('/loyalty/packages/templates'),
  });
  const { data: gifts } = useQuery({
    queryKey: ['gifts'],
    queryFn: () => api<any[]>('/loyalty/gifts'),
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: () => api<{ items: any[] }>('/clients?limit=100'),
  });
  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => api<any[]>('/services'),
  });

  const createGift = useMutation({
    mutationFn: () =>
      api('/loyalty/gifts', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(giftAmount) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gifts'] });
      setGiftOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const sellPkg = useMutation({
    mutationFn: () =>
      api('/loyalty/packages/sell', {
        method: 'POST',
        body: JSON.stringify(pkgForm),
      }),
    onSuccess: () => {
      setPkgOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const createTpl = useMutation({
    mutationFn: () =>
      api('/loyalty/packages/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: tplForm.name,
          sessionsTotal: Number(tplForm.sessionsTotal),
          price: Number(tplForm.price),
          validityDays: Number(tplForm.validityDays),
          serviceId: tplForm.serviceId || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['package-templates'] });
      setTplOpen(false);
      setTplForm({ name: '', sessionsTotal: 5, price: 2000, validityDays: 90, serviceId: '' });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Лояльність"
        subtitle="Бонуси, абонементи та подарункові сертифікати"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setTplOpen(true)}>
              + Шаблон
            </button>
            <button className="btn btn-secondary" onClick={() => setPkgOpen(true)}>
              Продати абонемент
            </button>
            <button className="btn btn-primary" onClick={() => setGiftOpen(true)}>
              Сертифікат
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="font-semibold">Шаблони абонементів</span>
            <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setTplOpen(true)}>
              Додати
            </button>
          </div>
          <div className="divide-y divide-border">
            {templates?.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-ink-muted">
                    {t.sessionsTotal} сеансів · {t.validityDays} днів
                    {t.service?.name ? ` · ${t.service.name}` : ''}
                  </div>
                </div>
                <div className="font-semibold">{formatMoney(t.price)}</div>
              </div>
            ))}
            {!templates?.length ? (
              <div className="p-5 text-sm text-ink-muted">Шаблонів немає — створіть перший</div>
            ) : null}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-semibold">Сертифікати</div>
          <div className="divide-y divide-border">
            {gifts?.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="font-mono font-medium">{g.code}</div>
                <div>
                  {formatMoney(g.balance)} / {formatMoney(g.initial)}
                </div>
              </div>
            ))}
            {!gifts?.length ? (
              <div className="p-5 text-sm text-ink-muted">Сертифікатів ще немає</div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-semibold">Бонусні рахунки</div>
        {isLoading ? (
          <LoadingBlock />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Клієнт</th>
                <th>Рівень</th>
                <th>Бали</th>
                <th>Витрати lifetime</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">
                    {a.client.firstName} {a.client.lastName || ''}
                  </td>
                  <td>
                    <span className="badge bg-gold-soft text-ink">{a.tier}</span>
                  </td>
                  <td>{Number(a.pointsBalance)}</td>
                  <td>{formatMoney(a.lifetimeSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal open={giftOpen} onClose={() => setGiftOpen(false)} title="Новий сертифікат">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createGift.mutate();
          }}
        >
          <Field label="Номінал ₴">
            <input
              className="input"
              type="number"
              min={100}
              value={giftAmount}
              onChange={(e) => setGiftAmount(Number(e.target.value))}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full">Створити</button>
        </form>
      </Modal>

      <Modal open={pkgOpen} onClose={() => setPkgOpen(false)} title="Продаж абонемента">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            sellPkg.mutate();
          }}
        >
          <Field label="Клієнт">
            <select
              className="input"
              required
              value={pkgForm.clientId}
              onChange={(e) => setPkgForm({ ...pkgForm, clientId: e.target.value })}
            >
              <option value="">Оберіть...</option>
              {clients?.items?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName || ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Абонемент">
            <select
              className="input"
              required
              value={pkgForm.templateId}
              onChange={(e) => setPkgForm({ ...pkgForm, templateId: e.target.value })}
            >
              <option value="">Оберіть...</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {formatMoney(t.price)}
                </option>
              ))}
            </select>
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full">Оформити</button>
        </form>
      </Modal>

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Новий шаблон абонемента">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createTpl.mutate();
          }}
        >
          <Field label="Назва">
            <input
              className="input"
              required
              value={tplForm.name}
              onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
              placeholder="Манікюр ×5"
            />
          </Field>
          <Field label="Послуга (опційно)">
            <select
              className="input"
              value={tplForm.serviceId}
              onChange={(e) => setTplForm({ ...tplForm, serviceId: e.target.value })}
            >
              <option value="">Будь-яка / загальний</option>
              {(services || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Сеансів">
              <input
                className="input"
                type="number"
                min={1}
                value={tplForm.sessionsTotal}
                onChange={(e) =>
                  setTplForm({ ...tplForm, sessionsTotal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Ціна ₴">
              <input
                className="input"
                type="number"
                min={0}
                value={tplForm.price}
                onChange={(e) => setTplForm({ ...tplForm, price: Number(e.target.value) })}
              />
            </Field>
            <Field label="Днів">
              <input
                className="input"
                type="number"
                min={1}
                value={tplForm.validityDays}
                onChange={(e) =>
                  setTplForm({ ...tplForm, validityDays: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={createTpl.isPending}>
            Створити шаблон
          </button>
        </form>
      </Modal>
    </div>
  );
}
