'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { canTakePayment, isMaster } from '@/lib/roles';
import { formatDateTime, formatMoney, formatTime, statusColors, statusLabels } from '@/lib/utils';
import { EmptyState, LoadingBlock, PageHeader, StatCard } from '@/components/ui';

export default function DashboardPage() {
  const { user } = useAuth();
  const masterMode = isMaster(user?.role);
  const { branchId, branch } = useBranch();
  const qc = useQueryClient();
  const [earnFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [earnTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const earnRange = useMemo(() => {
    const fromIso = new Date(`${earnFrom}T00:00:00`).toISOString();
    const toIso = new Date(`${earnTo}T23:59:59`).toISOString();
    return { fromIso, toIso };
  }, [earnFrom, earnTo]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', branchId],
    queryFn: () => api<any>('/dashboard'),
    enabled: !!branchId,
    refetchInterval: masterMode ? 15_000 : 30_000,
  });
  const { data: brief } = useQuery({
    queryKey: ['insights-brief', branchId],
    queryFn: () => api<any>('/insights/revenue-brief'),
    enabled: !!branchId && !masterMode,
  });
  const { data: myEarn } = useQuery({
    queryKey: ['my-commissions', earnRange.fromIso, earnRange.toIso],
    queryFn: () =>
      api<any>(
        `/reports/my-commissions?from=${earnRange.fromIso}&to=${earnRange.toIso}`,
      ),
    enabled: masterMode && !!user?.staffProfileId,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  if (isLoading || !branchId) return <LoadingBlock />;
  if (!data) return <EmptyState title="Немає даних" />;

  const { kpis, appointmentsToday, upcoming } = data;
  const nextAppt = (appointmentsToday || []).find((a: any) =>
    ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status),
  );

  return (
    <div>
      <PageHeader
        title={masterMode ? 'Мій день' : 'Дашборд'}
        subtitle={
          masterMode
            ? 'Швидкі дії по ваших записах'
            : branch
              ? `${branch.name} · сьогодні`
              : 'Огляд роботи салону на сьогодні'
        }
        actions={
          <>
            <Link href="/appointments" className="btn btn-secondary">
              Календар
            </Link>
            {canTakePayment(user?.role) ? (
              <Link href="/cash" className="btn btn-primary">
                Каса
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label={masterMode ? 'Моїх записів' : 'Записів сьогодні'}
          value={kpis.appointmentsToday}
        />
        {!masterMode ? (
          <StatCard label="Виручка сьогодні" value={formatMoney(kpis.revenueToday)} accent="text-rose" />
        ) : null}
        {!masterMode ? <StatCard label="Нові клієнти" value={kpis.newClients} /> : null}
        {!masterMode ? (
          <StatCard label="Низький залишок" value={kpis.lowStock} hint="товарів на мінімумі" />
        ) : null}
        {!masterMode ? (
          <StatCard
            label="Лист очікування"
            value={kpis.waitlist ?? 0}
            hint="очікують місце"
            accent="text-amber-700"
          />
        ) : null}
        <StatCard label="Завершено сьогодні" value={kpis.completedToday ?? 0} />
        {masterMode ? (
          <StatCard label="Очікують / в процесі" value={kpis.pendingOnline ?? 0} />
        ) : null}
        {masterMode ? (
          <StatCard
            label="Заробіток сьогодні"
            value={formatMoney(kpis.masterEarningsToday ?? 0)}
            hint={
              kpis.masterCommissionPct
                ? `${kpis.masterCommissionPct}% · ${kpis.completedToday ?? 0} завершено`
                : 'з оплачених послуг'
            }
            accent="text-rose"
          />
        ) : null}
        {masterMode && myEarn?.item ? (
          <StatCard
            label="Мій заробіток (місяць)"
            value={formatMoney(myEarn.item.commission)}
            hint={`${myEarn.item.salesCount} чек. · ${myEarn.item.commissionPct}%`}
            accent="text-rose"
          />
        ) : null}
        {masterMode ? (
          <StatCard label="No-show сьогодні" value={kpis.noShowToday ?? 0} />
        ) : null}
      </div>

      {masterMode && myEarn?.item ? (
        <section className="card mb-6 p-4 text-sm">
          <div className="font-semibold">Мої нарахування (з початку місяця)</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <div className="text-xs text-ink-muted">Виручка послуг</div>
              <div className="font-medium">{formatMoney(myEarn.item.serviceRevenue)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Комісія %</div>
              <div className="font-medium">{myEarn.item.commissionPct}%</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">До виплати</div>
              <div className="font-semibold text-rose">{formatMoney(myEarn.item.commission)}</div>
            </div>
          </div>
        </section>
      ) : null}

      {masterMode && nextAppt ? (
        <section className="card mb-6 border-rose/30 bg-rose-soft/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-dark">
            Наступний візит
          </div>
          <div className="mt-1 text-lg font-bold">
            {formatTime(nextAppt.startAt)} · {nextAppt.client.firstName}{' '}
            {nextAppt.client.lastName || ''}
          </div>
          <div className="text-sm text-ink-muted">
            {nextAppt.services?.map((s: any) => s.nameSnapshot).join(', ')}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextAppt.status === 'CONFIRMED' || nextAppt.status === 'PENDING' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStatus.mutate({ id: nextAppt.id, status: 'IN_PROGRESS' })}
                disabled={setStatus.isPending}
              >
                Check-in / Почати
              </button>
            ) : null}
            {nextAppt.status === 'IN_PROGRESS' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStatus.mutate({ id: nextAppt.id, status: 'COMPLETED' })}
                disabled={setStatus.isPending}
              >
                Завершити
              </button>
            ) : null}
            <Link href="/appointments" className="btn btn-secondary">
              Усі записи
            </Link>
          </div>
        </section>
      ) : null}

      {!masterMode ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/waitlist" className="btn btn-secondary">
            Лист очікування
          </Link>
          <Link href="/recurring" className="btn btn-secondary">
            Повторювані
          </Link>
          <Link href="/reports" className="btn btn-secondary">
            Комісії / ЗП
          </Link>
          <Link href="/book" className="btn btn-ghost" target="_blank">
            Онлайн-запис
          </Link>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/appointments" className="btn btn-primary">
            Мій розклад
          </Link>
          <Link href="/clients" className="btn btn-secondary">
            Клієнти
          </Link>
        </div>
      )}

      {!masterMode && brief ? (
        <div className="card mb-6 p-4 text-sm">
          <div className="font-semibold">AI-інсайт (тиждень)</div>
          <p className="mt-1 text-ink-muted">{brief.summaryUk}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4 font-semibold">
            {masterMode ? 'Сьогодні · швидкі статуси' : 'Записи на сьогодні'}
          </div>
          <div className="divide-y divide-border">
            {appointmentsToday.length === 0 ? (
              <div className="p-6 text-sm text-ink-muted">На сьогодні записів немає</div>
            ) : (
              appointmentsToday.map((a: any) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {formatTime(a.startAt)} · {a.client.firstName} {a.client.lastName || ''}
                      </div>
                      <div className="text-sm text-ink-muted">
                        {!masterMode ? `${a.staff.displayName} · ` : null}
                        {a.services.map((s: any) => s.nameSnapshot).join(', ')}
                      </div>
                    </div>
                    <span className={`badge shrink-0 ${statusColors[a.status]}`}>
                      {statusLabels[a.status]}
                    </span>
                  </div>
                  {masterMode &&
                  a.status !== 'COMPLETED' &&
                  a.status !== 'CANCELLED' &&
                  a.status !== 'NO_SHOW' ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(a.status === 'CONFIRMED' || a.status === 'PENDING') && (
                        <button
                          type="button"
                          className="btn btn-secondary px-2 py-1 text-xs"
                          onClick={() => setStatus.mutate({ id: a.id, status: 'IN_PROGRESS' })}
                          disabled={setStatus.isPending}
                        >
                          Почати
                        </button>
                      )}
                      {a.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          className="btn btn-primary px-2 py-1 text-xs"
                          onClick={() => setStatus.mutate({ id: a.id, status: 'COMPLETED' })}
                          disabled={setStatus.isPending}
                        >
                          Завершити
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => setStatus.mutate({ id: a.id, status: 'NO_SHOW' })}
                        disabled={setStatus.isPending}
                      >
                        No-show
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4 font-semibold">Найближчі записи</div>
          <div className="divide-y divide-border">
            {upcoming.length === 0 ? (
              <div className="p-6 text-sm text-ink-muted">Немає майбутніх записів</div>
            ) : (
              upcoming.map((a: any) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="font-medium">
                    {a.client.firstName} {a.client.lastName || ''}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {formatDateTime(a.startAt)}
                    {!masterMode ? ` · ${a.staff.displayName}` : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
