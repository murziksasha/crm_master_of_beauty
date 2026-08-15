'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<any | null>(null);
  const [form, setForm] = useState({
    appointmentId: '',
    amount: 0,
    description: 'Передплата послуг',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api<any[]>('/payments?limit=50'),
  });

  const { data: appointments } = useQuery({
    queryKey: ['appointments-upcoming'],
    queryFn: () => {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 14 * 86400000).toISOString();
      return api<any[]>(`/appointments?from=${from}&to=${to}`);
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api('/payments/liqpay/checkout', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: form.appointmentId || undefined,
          amount: form.amount || undefined,
          description: form.description,
        }),
      }),
    onSuccess: (res) => {
      setCheckout(res);
      setOpen(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const statusColor: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    SUCCESS: 'bg-emerald-100 text-emerald-800',
    FAILURE: 'bg-rose-100 text-rose-800',
    REVERSED: 'bg-slate-100 text-slate-700',
  };

  return (
    <div>
      <PageHeader
        title="Онлайн-оплати LiqPay"
        subtitle="Передплата записів та callback-статуси"
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <CreditCard size={16} /> Створити оплату
          </button>
        }
      />

      <div className="mb-4 rounded-xl border border-border bg-cream px-4 py-3 text-sm text-ink-muted">
        Для реальної оплати додайте в <code>.env</code> ключі{' '}
        <code>LIQPAY_PUBLIC_KEY</code>, <code>LIQPAY_PRIVATE_KEY</code>,{' '}
        <code>LIQPAY_ENABLED=true</code> та <code>PUBLIC_BASE_URL</code>.
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Сума</th>
                <th>Опис</th>
                <th>Клієнт</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.orderId}</td>
                  <td className="font-semibold">{formatMoney(p.amount)}</td>
                  <td>{p.description}</td>
                  <td>
                    {p.client
                      ? `${p.client.firstName} ${p.client.lastName || ''}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`badge ${statusColor[p.status] || ''}`}>{p.status}</span>
                  </td>
                  <td>{formatDateTime(p.createdAt)}</td>
                </tr>
              ))}
              {!data?.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    Платежів ще немає
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="LiqPay checkout">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Запис (опційно)">
            <select
              className="input"
              value={form.appointmentId}
              onChange={(e) => {
                const id = e.target.value;
                const appt = appointments?.find((a) => a.id === id);
                const amount =
                  appt?.services?.reduce(
                    (s: number, x: any) => s + Number(x.priceSnapshot),
                    0,
                  ) || 0;
                setForm({ ...form, appointmentId: id, amount });
              }}
            >
              <option value="">Без привʼязки / довільна сума</option>
              {appointments?.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDateTime(a.startAt)} · {a.client?.firstName} ·{' '}
                  {a.staff?.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Сума ₴">
            <input
              className="input"
              type="number"
              min={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Опис">
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={create.isPending}>
            Згенерувати LiqPay
          </button>
        </form>
      </Modal>

      <Modal open={!!checkout} onClose={() => setCheckout(null)} title="Форма LiqPay">
        {checkout ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-cream p-3 text-sm">
              <div>
                Order: <code>{checkout.orderId}</code>
              </div>
              <div>Сума: {formatMoney(checkout.amount)}</div>
              <div>Sandbox: {checkout.sandbox ? 'так' : 'ні'}</div>
            </div>
            <form method="POST" action={checkout.form.action} acceptCharset="utf-8">
              <input type="hidden" name="data" value={checkout.form.data} />
              <input type="hidden" name="signature" value={checkout.form.signature} />
              <button className="btn btn-primary w-full" type="submit">
                Перейти до оплати LiqPay
              </button>
            </form>
            <p className="text-xs text-ink-muted">
              Після оплати LiqPay надішле callback на{' '}
              <code>/api/v1/payments/liqpay/callback</code>.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
