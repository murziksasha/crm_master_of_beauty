'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalApi } from '@/lib/api';
import { formatDateTime, formatMoney, statusLabels } from '@/lib/utils';
import { ErrorText, Field } from '@/components/ui';

const TOKEN_KEY = 'portalToken';

export default function ClientPortalPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'app'>('phone');
  const [token, setToken] = useState<string | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [appts, setAppts] = useState<{ upcoming: any[]; past: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    setToken(t);
    setStep('app');
    void load(t);
  }, []);

  async function load(t: string) {
    setLoading(true);
    setError(null);
    try {
      const [me, list] = await Promise.all([
        portalApi.me(t),
        portalApi.appointments(t),
      ]);
      setClient(me);
      setAppts(list);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setStep('phone');
      setError('Сесію вичерпано — увійдіть знову');
    } finally {
      setLoading(false);
    }
  }

  async function requestCode() {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await portalApi.requestCode(phone);
      setHint(res.devCode ? `DEV-код: ${res.devCode}` : res.message);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await portalApi.verify(phone, code);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setClient(res.client);
      setStep('app');
      await load(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Невірний код');
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id: string) {
    if (!token) return;
    if (!confirm('Скасувати запис? (не пізніше ніж за 3 год)')) return;
    setLoading(true);
    setError(null);
    try {
      await portalApi.cancel(token, id, 'Скасовано з кабінету');
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка скасування');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setClient(null);
    setAppts(null);
    setStep('phone');
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-border bg-white/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="font-semibold text-rose-dark">
            Master of Beauty
          </Link>
          <div className="flex gap-2 text-sm">
            <Link href="/book" className="btn btn-ghost px-2 py-1">
              Запис
            </Link>
            {token ? (
              <button className="btn btn-secondary px-2 py-1" onClick={logout}>
                Вийти
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">Мій кабінет</h1>
        <p className="mb-6 text-sm text-ink-muted">
          Перегляд записів, бонусів і скасування візиту
        </p>

        {step !== 'app' ? (
          <div className="card space-y-4 p-6">
            {step === 'phone' ? (
              <>
                <Field label="Телефон">
                  <input
                    className="input"
                    placeholder="+380..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                <button
                  className="btn btn-primary w-full"
                  disabled={phone.length < 9 || loading}
                  onClick={() => void requestCode()}
                >
                  Отримати SMS-код
                </button>
              </>
            ) : (
              <>
                <Field label="Код з SMS">
                  <input
                    className="input font-mono tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                  />
                </Field>
                {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
                <button
                  className="btn btn-primary w-full"
                  disabled={code.length < 4 || loading}
                  onClick={() => void verify()}
                >
                  Увійти
                </button>
                <button className="btn btn-ghost w-full" onClick={() => setStep('phone')}>
                  Змінити телефон
                </button>
              </>
            )}
            <ErrorText error={error} />
          </div>
        ) : (
          <div className="space-y-6">
            {client ? (
              <div className="card grid gap-3 p-5 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-ink-muted">Клієнт</div>
                  <div className="font-semibold">
                    {client.firstName} {client.lastName || ''}
                  </div>
                  <div className="text-sm text-ink-muted">{client.phone}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Бонуси</div>
                  <div className="font-semibold">
                    {Number(client.loyalty?.pointsBalance || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Рівень</div>
                  <div className="font-semibold">{client.loyalty?.tier || 'BRONZE'}</div>
                </div>
              </div>
            ) : null}

            <ErrorText error={error} />

            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Найближчі записи</h2>
              {loading && !appts ? (
                <p className="text-sm text-ink-muted">Завантаження…</p>
              ) : !appts?.upcoming?.length ? (
                <p className="text-sm text-ink-muted">Немає майбутніх записів</p>
              ) : (
                <div className="space-y-3">
                  {appts.upcoming.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="font-medium">{formatDateTime(a.startAt)}</div>
                      <div className="text-ink-muted">
                        {a.staff?.displayName} ·{' '}
                        {a.services?.map((s: any) => s.nameSnapshot).join(', ')}
                      </div>
                      {a.room?.name ? <div className="text-xs">Кабінет: {a.room.name}</div> : null}
                      {a.depositPaidAt ? (
                        <div className="text-xs text-emerald-700">
                          Депозит сплачено {formatMoney(a.depositAmount)}
                        </div>
                      ) : a.depositAmount ? (
                        <div className="text-xs text-amber-700">
                          Депозит очікується: {formatMoney(a.depositAmount)}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="badge bg-cream">{statusLabels[a.status] || a.status}</span>
                        <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => void cancel(a.id)}>
                          Скасувати
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Історія</h2>
              {!appts?.past?.length ? (
                <p className="text-sm text-ink-muted">Порожньо</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-auto">
                  {appts.past.slice(0, 20).map((a) => (
                    <div key={a.id} className="flex justify-between border-b border-border py-2 text-sm">
                      <span>
                        {formatDateTime(a.startAt)} · {a.staff?.displayName}
                      </span>
                      <span className="text-ink-muted">{statusLabels[a.status] || a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Link href="/book" className="btn btn-primary w-full">
              Записатись знову
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
