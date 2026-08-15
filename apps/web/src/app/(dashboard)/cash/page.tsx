'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatDateTime, formatMoney, paymentLabels } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader, StatCard } from '@/components/ui';

export default function CashPage() {
  const { branchId, branch } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    productId: '',
    qty: 1,
    method: 'CASH',
    giftCode: '',
  });

  const { data: today } = useQuery({
    queryKey: ['cash-today', branchId],
    queryFn: () => api<any>('/cash/today'),
    enabled: !!branchId,
  });
  const { data: shift } = useQuery({
    queryKey: ['cash-shift', branchId],
    queryFn: () => api<any>('/cash/shift/current'),
    enabled: !!branchId,
  });
  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales', branchId],
    queryFn: () => api<{ items: any[] }>('/cash?limit=40'),
    enabled: !!branchId,
  });
  const { data: products } = useQuery({
    queryKey: ['products', branchId],
    queryFn: () => api<any[]>('/inventory/products'),
    enabled: !!branchId,
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: () => api<{ items: any[] }>('/clients?limit=100'),
  });

  const openShift = useMutation({
    mutationFn: () =>
      api('/cash/shift/open', {
        method: 'POST',
        body: JSON.stringify({ openingFloat: 0 }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-shift'] }),
    onError: (e: Error) => setError(e.message),
  });

  const closeShift = useMutation({
    mutationFn: () =>
      api(`/cash/shift/${shift.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ closingCash: Number(closingCash) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-shift'] });
      setCloseOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const refund = useMutation({
    mutationFn: (id: string) =>
      api(`/cash/${id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Сторно з каси' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['cash-today'] });
      setReceipt(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const create = useMutation({
    mutationFn: () => {
      const product = products?.find((p) => p.id === form.productId);
      if (!product) throw new Error('Оберіть товар');
      return api('/cash', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId || undefined,
          method: form.method,
          giftCode: form.giftCode?.trim() || undefined,
          items: [
            {
              type: 'PRODUCT',
              refId: product.id,
              name: product.name,
              qty: Number(form.qty),
              unitPrice: Number(product.salePrice),
            },
          ],
        }),
      });
    },
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['cash-today'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
      setReceipt(sale);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const openSale = useMutation({
    mutationFn: (id: string) => api(`/cash/${id}`),
    onSuccess: (sale) => setReceipt(sale),
  });

  return (
    <div>
      <PageHeader
        title="Каса"
        subtitle={branch ? `${branch.name} · продажі та чеки` : 'Продажі, чеки та підсумки дня'}
        actions={
          <>
            {!shift ? (
              <button className="btn btn-secondary" onClick={() => openShift.mutate()} disabled={openShift.isPending}>
                Відкрити зміну
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setClosingCash(Number(today?.cash || 0));
                  setCloseOpen(true);
                }}
              >
                Закрити зміну
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} /> Продаж товару
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Чеків сьогодні" value={today?.count ?? 0} />
        <StatCard label="Виручка" value={formatMoney(today?.total || 0)} accent="text-rose" />
        <StatCard label="Готівка" value={formatMoney(today?.cash || 0)} />
        <StatCard label="Картка" value={formatMoney(today?.card || 0)} />
        <StatCard
          label="Зміна"
          value={shift ? 'Відкрита' : 'Закрита'}
          hint={shift ? `з ${new Date(shift.openedAt).toLocaleTimeString('uk-UA')}` : 'відкрийте перед продажами'}
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Клієнт</th>
                <th>Спосіб</th>
                <th>Статус</th>
                <th>Сума</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales?.items?.map((s) => (
                <tr key={s.id} className={s.status === 'REFUNDED' ? 'opacity-60' : ''}>
                  <td className="font-medium">{s.number}</td>
                  <td>{formatDateTime(s.paidAt)}</td>
                  <td>
                    {s.client
                      ? `${s.client.firstName} ${s.client.lastName || ''}`
                      : '—'}
                  </td>
                  <td>{paymentLabels[s.method] || s.method}</td>
                  <td>{s.status === 'REFUNDED' ? 'Сторно' : 'Оплачено'}</td>
                  <td className="font-semibold">{formatMoney(s.total)}</td>
                  <td>
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={() => openSale.mutate(s.id)}
                    >
                      Чек
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Швидкий продаж товару">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Товар">
            <select
              className="input"
              required
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Оберіть...</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatMoney(p.salePrice)} · залишок {Number(p.stockQty)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Кількість">
            <input
              className="input"
              type="number"
              min={1}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
            />
          </Field>
          <Field label="Клієнт (опційно)">
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">Без клієнта</option>
              {clients?.items?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName || ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Оплата">
            <select
              className="input"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              <option value="CASH">Готівка</option>
              <option value="CARD">Картка</option>
            </select>
          </Field>
          <Field label="Сертифікат (код)">
            <input
              className="input font-mono uppercase"
              placeholder="GIFT-XXXX"
              value={form.giftCode}
              onChange={(e) => setForm({ ...form, giftCode: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={create.isPending}>
            Провести
          </button>
        </form>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Чек">
        {receipt ? (
          <div>
            <div className="print-receipt space-y-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold">Master of Beauty</div>
                <div className="text-ink-muted">Внутрішній чек</div>
              </div>
              <div className="flex justify-between">
                <span>№ {receipt.number}</span>
                <span>{formatDateTime(receipt.paidAt)}</span>
              </div>
              {receipt.client ? (
                <div>
                  Клієнт: {receipt.client.firstName} {receipt.client.lastName || ''}
                </div>
              ) : null}
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
              <div className="pt-2 text-center text-xs text-ink-muted">Дякуємо!</div>
            </div>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary flex-1" onClick={() => window.print()}>
                <Printer size={16} /> Друкувати
              </button>
              {receipt.status !== 'REFUNDED' ? (
                <button
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    if (confirm('Сторнувати чек? Склад і бонуси буде відкочено.')) {
                      refund.mutate(receipt.id);
                    }
                  }}
                  disabled={refund.isPending}
                >
                  Сторно
                </button>
              ) : (
                <span className="badge bg-amber-100 text-amber-800">Сторновано</span>
              )}
              <button className="btn btn-ghost flex-1" onClick={() => setReceipt(null)}>
                Закрити
              </button>
            </div>
            <ErrorText error={error} />
          </div>
        ) : null}
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="Закрити касову зміну">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Вкажіть фактичну готівку в касі. Система порахує очікувану суму і різницю.
          </p>
          <Field label="Готівка в касі (₴)">
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={closingCash}
              onChange={(e) => setClosingCash(Number(e.target.value))}
            />
          </Field>
          <ErrorText error={error} />
          <button
            className="btn btn-primary w-full"
            disabled={closeShift.isPending || !shift}
            onClick={() => closeShift.mutate()}
          >
            Закрити зміну
          </button>
        </div>
      </Modal>
    </div>
  );
}
