'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';
import { EmptyState, ErrorText, Field, LoadingBlock, Modal, PageHeader } from '@/components/ui';

export default function ServicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [materialsFor, setMaterialsFor] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryId: '',
    name: '',
    durationMin: 60,
    price: 500,
    description: '',
  });
  const [matRows, setMatRows] = useState<{ productId: string; qty: number; unitNote: string }[]>([
    { productId: '', qty: 1, unitNote: '' },
  ]);

  const { data: categories, isLoading } = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => api<any[]>('/services/categories?all=1'),
  });

  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api<any[]>('/inventory/products'),
  });

  const { data: materials, isLoading: matLoading } = useQuery({
    queryKey: ['service-materials', materialsFor?.id],
    queryFn: () => api<any[]>(`/services/${materialsFor.id}/materials`),
    enabled: !!materialsFor?.id,
  });

  useEffect(() => {
    if (!materialsFor?.id || !materials) return;
    if (materials.length) {
      setMatRows(
        materials.map((m: any) => ({
          productId: m.productId,
          qty: Number(m.qty),
          unitNote: m.unitNote || '',
        })),
      );
    } else {
      setMatRows([{ productId: '', qty: 1, unitNote: '' }]);
    }
  }, [materialsFor?.id, materials]);

  const create = useMutation({
    mutationFn: () =>
      api('/services', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          durationMin: Number(form.durationMin),
          price: Number(form.price),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-categories'] });
      setOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveMaterials = useMutation({
    mutationFn: () =>
      api(`/services/${materialsFor.id}/materials`, {
        method: 'PUT',
        body: JSON.stringify({
          materials: matRows
            .filter((r) => r.productId && Number(r.qty) > 0)
            .map((r) => ({
              productId: r.productId,
              qty: Number(r.qty),
              unitNote: r.unitNote || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-materials', materialsFor.id] });
      setMaterialsFor(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function openMaterials(service: any) {
    setMaterialsFor(service);
    setError(null);
    setMatRows([{ productId: '', qty: 1, unitNote: '' }]);
  }

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Послуги"
        subtitle="Каталог і рецепти матеріалів (BOM) для автосписання зі складу"
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm((f) => ({
                ...f,
                categoryId: categories?.[0]?.id || '',
              }));
              setOpen(true);
            }}
          >
            <Plus size={16} /> Додати послугу
          </button>
        }
      />

      {!categories?.length ? (
        <EmptyState title="Немає категорій" />
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <section key={cat.id} className="card overflow-hidden">
              <div className="border-b border-border bg-cream px-5 py-3 font-semibold">
                {cat.name}
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Тривалість</th>
                    <th>Ціна</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cat.services.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-medium">{s.name}</div>
                        {s.description ? (
                          <div className="text-xs text-ink-muted">{s.description}</div>
                        ) : null}
                      </td>
                      <td>{s.durationMin} хв</td>
                      <td className="font-medium">{formatMoney(s.price)}</td>
                      <td>
                        <span
                          className={`badge ${s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {s.isActive ? 'Активна' : 'Вимкнена'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost px-2 py-1 text-xs"
                          onClick={() => openMaterials(s)}
                        >
                          <Package size={14} /> Рецепт
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Нова послуга">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Категорія">
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Назва">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тривалість (хв)">
              <input
                className="input"
                type="number"
                min={5}
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
              />
            </Field>
            <Field label="Ціна (₴)">
              <input
                className="input"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Опис">
            <textarea
              className="input min-h-20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={create.isPending}>
            Зберегти
          </button>
        </form>
      </Modal>

      <Modal
        open={!!materialsFor}
        onClose={() => setMaterialsFor(null)}
        title={materialsFor ? `Рецепт: ${materialsFor.name}` : 'Рецепт'}
        wide
      >
        {matLoading ? (
          <LoadingBlock />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Матеріали списуються зі складу автоматично при оплаті послуги.
            </p>
            {matRows.map((row, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-3">
                <Field label="Товар">
                  <select
                    className="input"
                    value={row.productId}
                    onChange={(e) => {
                      const next = [...matRows];
                      next[idx] = { ...row, productId: e.target.value };
                      setMatRows(next);
                    }}
                  >
                    <option value="">—</option>
                    {(products || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({Number(p.stockQty)} {p.unit})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="К-сть на 1 послугу">
                  <input
                    className="input"
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={row.qty}
                    onChange={(e) => {
                      const next = [...matRows];
                      next[idx] = { ...row, qty: Number(e.target.value) };
                      setMatRows(next);
                    }}
                  />
                </Field>
                <Field label="Нотатка">
                  <input
                    className="input"
                    value={row.unitNote}
                    onChange={(e) => {
                      const next = [...matRows];
                      next[idx] = { ...row, unitNote: e.target.value };
                      setMatRows(next);
                    }}
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setMatRows([...matRows, { productId: '', qty: 1, unitNote: '' }])}
            >
              + рядок
            </button>
            <ErrorText error={error} />
            <button
              className="btn btn-primary w-full"
              disabled={saveMaterials.isPending}
              onClick={() => saveMaterials.mutate()}
            >
              Зберегти рецепт
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
