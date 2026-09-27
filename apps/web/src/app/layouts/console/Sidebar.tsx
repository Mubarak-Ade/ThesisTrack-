import {
  Building2,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const ROLE_TITLES: Record<string, string> = {
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  student: 'Student',
};

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  to?: string;
}

/**
 * Exactly the mockup's five items (spec §3) — there is no Users entry;
 * `/users*` is reached via Dashboard links and breadcrumbs (mockup parity).
 * Departments/Settings stay out-of-scope placeholders (spec §8).
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Faculty', icon: GraduationCap, to: '/faculty' },
  { label: 'Students', icon: UserRound, to: '/students' },
  { label: 'Departments', icon: Building2 },
  { label: 'Settings', icon: Settings },
];

interface SidebarProps {
  /** Closes the off-canvas drawer after a navigation (≤1024px). */
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const roleTitle = user ? (ROLE_TITLES[user.role] ?? user.role) : '';

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // The interceptor already turned 401/403 into their own redirect —
      // falling through to clear()+navigate would race it (the anonymous
      // route guard redirects to /unauthorized and wins).
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
      // The cookie may already be gone — local sign-out still proceeds.
    }
    // The anonymous guard on this route races the redirect below (its
    // <Navigate> fires in a later render than this call). Declaring the exit
    // target first makes both actors land on /login, whichever wins.
    useAuthStore.getState().setExitTo('/login');
    useAuthStore.getState().clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      {/* Brand row — desktop shows the wordmark, the drawer gets a close X. */}
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <span className="inline-flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M12 7v13" />
              <path d="M12 7C10.2 5.6 7.8 5 5 5v13c2.8 0 5.2.6 7 2" />
              <path d="M12 7c1.8-1.4 4.2-2 7-2v13c-2.8 0-5.2.6-7 2" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">ThesisTrack</span>
        </span>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onNavigate}
          className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            if (item.to) {
              return (
                <li key={item.label}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            }
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => toast.info(`${item.label} is not available yet`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Signed-in user footer (real session data) — mockup persona layout. */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user ? `${user.firstName} ${user.lastName}` : 'Signed in'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{roleTitle}</p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <Button
          type="button"
          onClick={signOut}
          className="mt-3 w-full justify-start gap-2 text-red-600 hover:bg-red-500/10 hover:text-red-600"
          variant="ghost"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
