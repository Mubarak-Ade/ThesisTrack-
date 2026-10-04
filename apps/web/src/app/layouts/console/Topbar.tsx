import { Bell, Menu, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';
import { useUnreadCount } from './useShellQueries';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'ADMINISTRATOR',
  supervisor: 'SUPERVISOR',
  student: 'STUDENT',
};

interface TopbarProps {
  /** Opens the off-canvas drawer (≤1024px). */
  onOpenMenu: () => void;
}

export default function Topbar({ onOpenMenu }: TopbarProps) {
  const role = useAuthStore((s) => s.user?.role);
  // Real badge (task 10.4): unread count from GET /notifications/unread-count.
  const unread = useUnreadCount().data ?? 0;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMenu}
          className="grid size-10 shrink-0 place-items-center rounded-md text-foreground hover:bg-accent lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        {/* Decorative search — focusable, no behavior (spec §3). */}
        <div className="relative hidden w-72 sm:block lg:w-[420px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search"
            placeholder="Search students, theses, or submissions…"
            className="h-10 pl-9"
          />
        </div>

        {/* Notification bell (§10.3 → /notifications) with the unread badge
            from GET /notifications/unread-count — real, focusable, announced. */}
        <Link
          to="/notifications"
          data-testid="topbar-bell"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'
          }
          className="relative ml-auto hidden shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        >
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              data-testid="topbar-bell-badge"
              className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        <div className="ml-auto min-w-0 text-right sm:ml-4">
          <p className="truncate text-[11px] font-bold uppercase tracking-widest text-primary">
            {role ? (ROLE_LABELS[role] ?? role.toUpperCase()) : 'USER'} SESSION
          </p>
          <p className="truncate text-xs text-muted-foreground">Department of Informatics</p>
        </div>
      </div>
    </header>
  );
}
