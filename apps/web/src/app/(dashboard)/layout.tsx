'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { BranchProvider, useBranch } from '@/lib/branch-context';
import { useRealtime } from '@/lib/use-realtime';
import { Sidebar } from '@/components/sidebar';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { branches, branchId, setBranchId } = useBranch();
  const [menuOpen, setMenuOpen] = useState(false);
  useRealtime(!!branchId);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur">
          <button
            className="btn btn-secondary p-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Відкрити меню"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 font-semibold text-ink lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose text-white">
              <Sparkles size={14} />
            </span>
            Master of Beauty
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden text-xs font-medium text-ink-muted sm:block">Філія</label>
            <select
              className="input w-auto min-w-[12rem] py-1.5 text-sm"
              value={branchId || ''}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        Завантаження...
      </div>
    );
  }

  return (
    <BranchProvider>
      <DashboardShell>{children}</DashboardShell>
    </BranchProvider>
  );
}
