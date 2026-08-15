'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatMoney, paymentLabels } from '@/lib/utils';
import { ErrorText, LoadingBlock, PageHeader, StatCard } from '@/components/ui';

export default function ReportsPage() {
  const { branchId, branch } = useBranch();
  const qc = useQueryClient();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payrollError, setPayrollError] = useState<string | null>(null);

  const range = useMemo(() => {
    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59`).toISOString();
    return { fromIso, toIso };
  }, [from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', from, to, branchId],
    queryFn: () =>
      api<any>(`/reports/overview?from=${range.fromIso}&to=${range.toIso}`),
    enabled: !!branchId,
  });

  const { data: commissions } = useQuery({
    queryKey: ['commissions', from, to, branchId],
    queryFn: () =>
      api<any>(`/reports/commissions?from=${range.fromIso}&to=${range.toIso}`),
    enabled: !!branchId,
  });

  const { data: inactive } = useQuery({
    queryKey: ['inactive-clients', branchId],
    queryFn: () => api<any>('/reports/inactive-clients?days=60'),
    enabled: !!branchId,
  });

  const { data: birthdays } = useQuery({
    queryKey: ['birthdays', branchId],
    queryFn: () => api<any>('/reports/birthdays?days=7'),
    enabled: !!branchId,
  });

  const { data: brief } = useQuery({
    queryKey: ['insights-brief', branchId],
    queryFn: () => api<any>('/insights/revenue-brief'),
    enabled: !!branchId,
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => api<any[]>('/payroll'),
    enabled: !!branchId,
  });

  const closePayroll = useMutation({
    mutationFn: () =>
      api('/payroll/close', {
        method: 'POST',
        body: JSON.stringify({
          from: range.fromIso,
          to: range.toIso,
          note: `Закриття ${from} — ${to}`,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      setPayrollError(null);
    },
    onError: (e: Error) => setPayrollError(e.message),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      api(`/payroll/${id}/mark-paid`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-periods'] }),
    onError: (e: Error) => setPayrollError(e.message),
  });

  const reopenPayroll = useMutation({
    mutationFn: (id: string) =>
      api(`/payroll/${id}/reopen`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      setPayrollError(null);
    },
    onError: (e: Error) => setPayrollError(e.message),
  });

  const unmarkPaid = useMutation({
    mutationFn: (id: string) =>
      api(`/payroll/${id}/unmark-paid`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      setPayrollError(null);
    },
    onError: (e: Error) => setPayrollError(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Звіти"
        subtitle={branch ? `${branch.name} · аналітика` : 'Виручка, завантаженість і аналітика'}
        actions={
          <>
            <input className="input w-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input w-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const token = localStorage.getItem('accessToken');
                fetch(
                  `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/reports/export.csv?from=${range.fromIso}&to=${range.toIso}`,
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'X-Branch-Id': branchId || '',
                    },
                  },
                )
                  .then((r) => r.text())
                  .then((csv) => {
                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'sales.csv';
                    a.click();
                  });
              }}
            >
              Продажі CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const token = localStorage.getItem('accessToken');
                fetch(
                  `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/reports/commissions.csv?from=${range.fromIso}&to=${range.toIso}`,
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'X-Branch-Id': branchId || '',
                    },
                  },
                )
                  .then((r) => r.text())
                  .then((csv) => {
                    const blob = new Blob([csv.startsWith('\uFEFF') ? csv : '\uFEFF' + csv], {
                      type: 'text/csv;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'commissions-payout.csv';
                    a.click();
                  });
              }}
            >
              Виплати CSV
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={closePayroll.isPending}
              onClick={() => {
                if (confirm(`Закрити зарплатний період ${from} — ${to}?`)) {
                  closePayroll.mutate();
                }
              }}
            >
              Закрити період ЗП
            </button>
          </>
        }
      />

      <ErrorText error={payrollError} />

      {payrollPeriods?.length ? (
        <section className="card mb-6 p-5">
          <h3 className="mb-3 font-semibold">Закриті зарплатні періоди</h3>
          <div className="space-y-2">
            {payrollPeriods.slice(0, 8).map((p: any) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {new Date(p.fromDate).toLocaleDateString('uk-UA')} —{' '}
                    {new Date(p.toDate).toLocaleDateString('uk-UA')}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {p.lines?.length || 0} майстрів · {formatMoney(p.totalAmount)} · {p.status}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      const token = localStorage.getItem('accessToken');
                      fetch(
                        `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/payroll/${p.id}/export.csv`,
                        { headers: { Authorization: `Bearer ${token}` } },
                      )
                        .then((r) => r.text())
                        .then((csv) => {
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `payroll-${p.id.slice(0, 8)}.csv`;
                          a.click();
                        });
                    }}
                  >
                    CSV
                  </button>
                  {p.status === 'PAID' ? (
                    <>
                      <span className="badge bg-emerald-100 text-emerald-800">Виплачено</span>
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          if (confirm('Зняти позначку виплати?')) {
                            unmarkPaid.mutate(p.id);
                          }
                        }}
                        disabled={unmarkPaid.isPending}
                      >
                        Unmark
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary px-2 py-1 text-xs"
                        onClick={() => markPaid.mutate(p.id)}
                        disabled={markPaid.isPending}
                      >
                        Виплачено
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          if (confirm('Відкрити період заново (видалиться запис)?')) {
                            reopenPayroll.mutate(p.id);
                          }
                        }}
                        disabled={reopenPayroll.isPending}
                      >
                        Reopen
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Виручка" value={formatMoney(data.revenue)} accent="text-rose" />
            <StatCard label="Чеків" value={data.salesCount} />
            <StatCard label="Середній чек" value={formatMoney(data.avgCheck)} />
            <StatCard label="Нові клієнти" value={data.newClients} />
            <StatCard label="Лист очікування" value={data.waitlistActive ?? 0} />
          </div>

          {brief ? (
            <section className="card mb-6 border-rose/20 bg-rose-soft/30 p-5">
              <h3 className="mb-2 font-semibold">Короткий інсайт тижня</h3>
              <p className="text-sm text-ink">{brief.summaryUk}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                <span>Цей тиждень: {formatMoney(brief.thisWeekRevenue)}</span>
                <span>Минулий: {formatMoney(brief.prevWeekRevenue)}</span>
                {brief.deltaPct != null ? <span>Δ {brief.deltaPct}%</span> : null}
              </div>
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">
                Комісії майстрів
                {commissions ? (
                  <span className="ml-2 text-sm font-normal text-ink-muted">
                    разом {formatMoney(commissions.totalCommission)}
                  </span>
                ) : null}
              </h3>
              <div className="space-y-2">
                {commissions?.items?.map((s: any) => (
                  <div key={s.staffId} className="flex items-center justify-between text-sm">
                    <span>
                      {s.name}{' '}
                      <span className="text-ink-muted">
                        ({s.commissionPct}% · {s.salesCount} чек.)
                      </span>
                    </span>
                    <span className="font-semibold">{formatMoney(s.commission)}</span>
                  </div>
                ))}
                {!commissions?.items?.length ? (
                  <div className="text-sm text-ink-muted">Немає даних за період</div>
                ) : null}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">
                Win-back · давно не були (60 днів)
                {inactive ? (
                  <span className="ml-2 text-sm font-normal text-ink-muted">{inactive.count}</span>
                ) : null}
              </h3>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {inactive?.items?.slice(0, 12).map((c: any) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span>
                      {c.firstName} {c.lastName || ''}
                      <span className="text-ink-muted"> · {c.phone}</span>
                    </span>
                    <span className="text-xs text-ink-muted">
                      {c.lastVisit
                        ? new Date(c.lastVisit.startAt).toLocaleDateString('uk-UA')
                        : '—'}
                    </span>
                  </div>
                ))}
                {!inactive?.items?.length ? (
                  <div className="text-sm text-ink-muted">Усі клієнти активні</div>
                ) : null}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">
                Дні народження (7 днів)
                {birthdays ? (
                  <span className="ml-2 text-sm font-normal text-ink-muted">{birthdays.count}</span>
                ) : null}
              </h3>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {birthdays?.items?.map((c: any) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span>
                      {c.firstName} {c.lastName || ''}
                      <span className="text-ink-muted"> · {c.phone}</span>
                    </span>
                    <span className="text-xs font-medium text-rose">
                      {c.daysUntil === 0 ? 'сьогодні' : `через ${c.daysUntil} д.`}
                    </span>
                  </div>
                ))}
                {!birthdays?.items?.length ? (
                  <div className="text-sm text-ink-muted">Найближчих ДН немає</div>
                ) : null}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">По майстрах</h3>
              <div className="space-y-2">
                {data.byStaff?.map((s: any) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span>
                      {s.name} <span className="text-ink-muted">({s.count})</span>
                    </span>
                    <span className="font-semibold">{formatMoney(s.revenue)}</span>
                  </div>
                ))}
                {!data.byStaff?.length ? (
                  <div className="text-sm text-ink-muted">Немає даних</div>
                ) : null}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Топ послуг</h3>
              <div className="space-y-2">
                {data.topServices?.map((s: any) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="font-semibold">{formatMoney(s.total)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Способи оплати</h3>
              <div className="space-y-2">
                {Object.entries(data.byMethod || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>{paymentLabels[k] || k}</span>
                    <span className="font-semibold">{formatMoney(v as number)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Записи</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Всього</span>
                  <span className="font-semibold">{data.appointments.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Скасування</span>
                  <span>{data.appointments.cancelRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span>No-show</span>
                  <span>{data.appointments.noShowRate}%</span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
