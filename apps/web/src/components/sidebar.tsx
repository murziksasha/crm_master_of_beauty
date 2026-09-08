'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Scissors,
  UserRound,
  Wallet,
  Package,
  Gift,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
  X,
  Repeat,
  CreditCard,
  ListOrdered,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { canAccess } from '@/lib/roles';
import { cn, roleLabels } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';

const nav = [
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/appointments', label: 'Записи', icon: CalendarDays },
  { href: '/waitlist', label: 'Лист очікування', icon: ListOrdered },
  { href: '/recurring', label: 'Повторювані', icon: Repeat },
  { href: '/clients', label: 'Клієнти', icon: Users },
  { href: '/services', label: 'Послуги', icon: Scissors },
  { href: '/staff', label: 'Майстри', icon: UserRound },
  { href: '/cash', label: 'Каса', icon: Wallet },
  { href: '/payments', label: 'LiqPay', icon: CreditCard },
  { href: '/inventory', label: 'Склад', icon: Package },
  { href: '/loyalty', label: 'Лояльність', icon: Gift },
  { href: '/reports', label: 'Звіти', icon: BarChart3 },
  { href: '/settings', label: 'Налаштування', icon: Settings },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const items = nav.filter((item) => canAccess(user?.role, item.href));

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:z-0 lg:w-64 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose text-white">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold leading-tight text-ink">Master of Beauty</div>
              <div className="text-xs text-ink-muted">CRM салону</div>
            </div>
            <button className="btn btn-ghost p-2 lg:hidden" onClick={onClose} aria-label="Закрити меню">
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  active
                    ? 'bg-rose-soft text-rose-dark'
                    : 'text-ink-muted hover:bg-cream-dark hover:text-ink',
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 rounded-xl bg-cream px-3 py-2">
            <div className="text-sm font-semibold text-ink">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-ink-muted">
              {user ? roleLabels[user.role] || user.role : ''}
            </div>
          </div>
          <select
            className="input mb-2 py-1.5 text-xs"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'light' | 'dark' | 'system')}
            aria-label="Тема"
          >
            <option value="system">Тема: система</option>
            <option value="light">Тема: світла</option>
            <option value="dark">Тема: темна</option>
          </select>
          <button className="btn btn-ghost w-full justify-start" onClick={logout}>
            <LogOut size={16} />
            Вийти
          </button>
        </div>
      </aside>
    </>
  );
}
