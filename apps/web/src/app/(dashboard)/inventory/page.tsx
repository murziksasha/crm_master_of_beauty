'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatMoney } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function InventoryPage() {
  const { branchId, branch } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    salePrice: 0,
    costPrice: 0,
    stockQty: 0,
    minStock: 0,
    unit: 'шт',
  });
  const [moveForm, setMoveForm] = useState({ type: 'IN', qty: 1, reason: '' });

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', branchId],
    queryFn: () => api<any[]>('/inventory/products'),
    enabled: !!branchId,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          branchId,
          salePrice: Number(form.salePrice),
          costPrice: Number(form.costPrice),
          stockQty: Number(form.stockQty),
          minStock: Number(form.minStock),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const move = useMutation({
    mutationFn: () =>
      api(`/inventory/products/${moveId}/move`, {
        method: 'POST',
        body: JSON.stringify({
          type: moveForm.type,
          qty: Number(moveForm.qty),
          reason: moveForm.reason,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setMoveId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Склад"
        subtitle={branch ? `${branch.name} · залишки` : 'Косметика, фарби, матеріали'}
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Товар
          </button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Назва</th>
                <th>Бренд</th>
                <th>Залишок</th>
                <th>Мін.</th>
                <th>Ціна</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p) => {
                const low = Number(p.stockQty) <= Number(p.minStock);
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.brand || '—'}</td>
                    <td>
                      <span className={low ? 'font-semibold text-rose' : ''}>
                        {Number(p.stockQty)} {p.unit}
                      </span>
                    </td>
                    <td>{Number(p.minStock)}</td>
                    <td>{formatMoney(p.salePrice)}</td>
                    <td>
                      <button
                        className="btn btn-secondary px-2 py-1 text-xs"
                        onClick={() => {
                          setMoveId(p.id);
                          setMoveForm({ type: 'IN', qty: 1, reason: '' });
                          setError(null);
                        }}
                      >
                        Рух
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Новий товар">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Назва">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Бренд">
            <input
              className="input"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ціна продажу">
              <input
                className="input"
                type="number"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Собівартість">
              <input
                className="input"
                type="number"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Залишок">
              <input
                className="input"
                type="number"
                value={form.stockQty}
                onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) })}
              />
            </Field>
            <Field label="Мін. залишок">
              <input
                className="input"
                type="number"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
              />
            </Field>
          </div>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full">Зберегти</button>
        </form>
      </Modal>

      <Modal open={!!moveId} onClose={() => setMoveId(null)} title="Рух по складу">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            move.mutate();
          }}
        >
          <Field label="Тип">
            <select
              className="input"
              value={moveForm.type}
              onChange={(e) => setMoveForm({ ...moveForm, type: e.target.value })}
            >
              <option value="IN">Прихід</option>
              <option value="OUT">Списання</option>
              <option value="ADJUST">Інвентаризація (встановити)</option>
            </select>
          </Field>
          <Field label="Кількість">
            <input
              className="input"
              type="number"
              min={0.001}
              step="any"
              value={moveForm.qty}
              onChange={(e) => setMoveForm({ ...moveForm, qty: Number(e.target.value) })}
            />
          </Field>
          <Field label="Причина">
            <input
              className="input"
              value={moveForm.reason}
              onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full">Підтвердити</button>
        </form>
      </Modal>
    </div>
  );
}
