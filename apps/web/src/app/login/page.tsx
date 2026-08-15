'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ErrorText, Field } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@masterofbeauty.ua');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#f5e6e7,transparent_40%),radial-gradient(circle_at_bottom_right,#f0e6d8,transparent_40%)]" />
      <div className="relative w-full max-w-md card p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose text-white">
            <Sparkles />
          </div>
          <div>
            <h1 className="text-xl font-bold">Master of Beauty</h1>
            <p className="text-sm text-ink-muted">Вхід для персоналу салону</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Пароль">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <ErrorText error={error} />
          <button className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? 'Вхід...' : 'Увійти'}
          </button>
        </form>

        <div className="mt-6 space-y-1 text-center text-xs text-ink-muted">
          <p>Власник: admin@masterofbeauty.ua / Admin123!</p>
          <p>Майстер: maria@masterofbeauty.ua / Master123!</p>
          <p>Рецепція: reception@masterofbeauty.ua / Reception123!</p>
        </div>
      </div>
    </div>
  );
}
