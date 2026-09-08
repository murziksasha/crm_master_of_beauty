'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, ScanBarcode, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatDateTime, formatMoney, paymentLabels } from '@/lib/utils';
import { ErrorText, Field, LoadingBlock, Modal, PageHeader, StatCard } from '@/components/ui';

type CartItem = {
  key: string;
  type: 'SERVICE' | 'PRODUCT';
  refId: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export default function CashPage() {
  const { branchId, branch } = useBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [giftCode, setGiftCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [serviceId, setServiceId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [barcode, setBarcode] = useState('');

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
  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => api<any[]>('/services'),
    enabled: open,
  });

  const subtotal = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const due = Math.max(0, subtotal - Number(discountAmount || 0) - Number(loyaltyRedeem || 0));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return (products || []).slice(0, 12);
    return (products || []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  function addItem(item: Omit<CartItem, 'key'>) {
    setCart((cur) => {
      const existing = cur.find((c) => c.type === item.type && c.refId === item.refId);
      if (existing) {
        return cur.map((c) =>
          c.key === existing.key ? { ...c, qty: c.qty + item.qty } : c,
        );
      }
      return [...cur, { ...item, key: `${item.type}-${item.refId}-${Date.now()}` }];
    });
  }

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
      if (!cart.length) throw new Error('Додайте позиції до кошика');
      const payload: any = {
        clientId: clientId || undefined,
        method,
        giftCode: giftCode.trim() || undefined,
        discountAmount: Number(discountAmount) || 0,
        loyaltyRedeem: Number(loyaltyRedeem) || 0,
        items: cart.map((i) => ({
          type: i.type,
          refId: i.refId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      };
      if (method === 'MIXED') {
        payload.cashAmount = Number(cashAmount);
        payload.cardAmount = Number(cardAmount);
      } else if (method === 'CASH') {
        payload.cashAmount = due;
      } else if (method === 'CARD') {
        payload.cardAmount = due;
      }
      return api('/cash', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['cash-today'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
      setCart([]);
      setReceipt(sale);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const openSale = useMutation({
    mutationFn: (id: string) => api(`/cash/${id}`),
    onSuccess: (sale) => setReceipt(sale),
  });

  const scan = useMutation({
    mutationFn: (code: string) => api<any>(`/inventory/products/barcode/${encodeURIComponent(code)}`),
    onSuccess: (p) => {
      addItem({
        type: 'PRODUCT',
        refId: p.id,
        name: p.name,
        qty: 1,
        unitPrice: Number(p.salePrice),
      });
      setBarcode('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const fiscal = receipt?.fiscalReceipts?.find((f: any) => f.type === 'SELL') || receipt?.fiscalReceipts?.[0];

  return (
    <div>
      <PageHeader
        title="Каса"
        subtitle={branch ? `${branch.name} · POS кошик, чеки, зміна` : 'Продажі, чеки та підсумки дня'}
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
            <button
              className="btn btn-primary"
              onClick={() => {
                setOpen(true);
                setError(null);
              }}
            >
              <Plus size={16} /> POS продаж
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

      <Modal open={open} onClose={() => setOpen(false)} title="POS кошик" wide>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Штрихкод / SKU">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (barcode.trim()) scan.mutate(barcode.trim());
                }}
              >
                <input
                  className="input font-mono"
                  value={barcode}
                  placeholder="Сканер або введення"
                  onChange={(e) => setBarcode(e.target.value)}
                />
                <button className="btn btn-secondary" type="submit" disabled={scan.isPending}>
                  <ScanBarcode size={16} />
                </button>
              </form>
            </Field>
            <Field label="Пошук товару">
              <input
                className="input"
                value={productSearch}
                placeholder="Назва, SKU..."
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </Field>
            <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-border p-2">
              {filteredProducts.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream"
                  onClick={() =>
                    addItem({
                      type: 'PRODUCT',
                      refId: p.id,
                      name: p.name,
                      qty: 1,
                      unitPrice: Number(p.salePrice),
                    })
                  }
                >
                  <span>
                    {p.name}
                    <span className="ml-2 text-xs text-ink-muted">зал. {Number(p.stockQty)}</span>
                  </span>
                  <span className="font-medium">{formatMoney(p.salePrice)}</span>
                </button>
              ))}
            </div>
            <Field label="Послуга walk-in">
              <div className="flex gap-2">
                <select
                  className="input"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  <option value="">Оберіть послугу</option>
                  {services?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {formatMoney(s.price)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const s = services?.find((x: any) => x.id === serviceId);
                    if (!s) return;
                    addItem({
                      type: 'SERVICE',
                      refId: s.id,
                      name: s.name,
                      qty: 1,
                      unitPrice: Number(s.price),
                    });
                    setServiceId('');
                  }}
                >
                  +
                </button>
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            <div className="max-h-48 space-y-2 overflow-auto rounded-xl border border-border p-2">
              {!cart.length ? (
                <p className="p-3 text-sm text-ink-muted">Кошик порожній</p>
              ) : (
                cart.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.name}</div>
                      <div className="text-xs text-ink-muted">
                        {i.type === 'SERVICE' ? 'Послуга' : 'Товар'} · {formatMoney(i.unitPrice)}
                      </div>
                    </div>
                    <input
                      className="input w-16 py-1 text-center"
                      type="number"
                      min={1}
                      value={i.qty}
                      onChange={(e) =>
                        setCart((cur) =>
                          cur.map((c) =>
                            c.key === i.key ? { ...c, qty: Number(e.target.value) || 1 } : c,
                          ),
                        )
                      }
                    />
                    <span className="w-20 text-right font-semibold">
                      {formatMoney(i.qty * i.unitPrice)}
                    </span>
                    <button
                      className="btn btn-ghost p-1"
                      onClick={() => setCart((cur) => cur.filter((c) => c.key !== i.key))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <Field label="Клієнт">
              <select
                className="input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Без клієнта</option>
                {clients?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName || ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Знижка ₴">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                />
              </Field>
              <Field label="Бонуси">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={loyaltyRedeem}
                  onChange={(e) => setLoyaltyRedeem(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Сертифікат">
              <input
                className="input font-mono uppercase"
                placeholder="GIFT-XXXX / WB45-..."
                value={giftCode}
                onChange={(e) => setGiftCode(e.target.value)}
              />
            </Field>
            <Field label="Оплата">
              <select
                className="input"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  if (e.target.value === 'MIXED') {
                    setCashAmount(Math.round(due / 2));
                    setCardAmount(due - Math.round(due / 2));
                  }
                }}
              >
                <option value="CASH">Готівка</option>
                <option value="CARD">Картка</option>
                <option value="MIXED">Спліт (готівка + картка)</option>
              </select>
            </Field>
            {method === 'MIXED' ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Готівка">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={cashAmount}
                    onChange={(e) => {
                      const cash = Number(e.target.value);
                      setCashAmount(cash);
                      setCardAmount(Math.max(0, due - cash));
                    }}
                  />
                </Field>
                <Field label="Картка">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={cardAmount}
                    onChange={(e) => {
                      const card = Number(e.target.value);
                      setCardAmount(card);
                      setCashAmount(Math.max(0, due - card));
                    }}
                  />
                </Field>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-bold">
              <span>До сплати</span>
              <span>{formatMoney(due)}</span>
            </div>
            <ErrorText error={error} />
            <button
              className="btn btn-primary w-full"
              disabled={create.isPending || !cart.length}
              onClick={() => create.mutate()}
            >
              Провести {formatMoney(due)}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Чек">
        {receipt ? (
          <div>
            <div className="print-receipt space-y-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold">Master of Beauty</div>
                <div className="text-ink-muted">Фіскальний / внутрішній чек 80мм</div>
                {receipt.cashier ? (
                  <div className="text-xs">
                    Касир: {receipt.cashier.firstName} {receipt.cashier.lastName}
                  </div>
                ) : null}
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
                  {receipt.method === 'MIXED'
                    ? ` · готівка ${formatMoney(receipt.cashAmount)} / картка ${formatMoney(receipt.cardAmount)}`
                    : ''}
                </div>
              </div>
              {fiscal?.taxUrl ? (
                <div className="pt-2 text-center text-xs">
                  <div>ПРРО {fiscal.fiscalCode}</div>
                  <img
                    alt="QR фіскального чека"
                    className="mx-auto mt-1 h-24 w-24 bg-white"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(fiscal.taxUrl)}`}
                  />
                  <div className="break-all">{fiscal.taxUrl}</div>
                </div>
              ) : null}
              <div className="pt-2 text-center text-xs text-ink-muted">Дякуємо!</div>
            </div>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary flex-1" onClick={() => window.print()}>
                <Printer size={16} /> Друкувати 80мм
              </button>
              {receipt.status !== 'REFUNDED' ? (
                <button
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    if (confirm('Сторнувати чек? Склад, BOM, абонемент і сертифікат буде відкочено.')) {
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
