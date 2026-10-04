import { useId, useState } from 'react';
import { ChevronDown, LogOut, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/signOut';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import type { NavItem } from './nav';

const ROLE_TITLES: Record<string, string> = {
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  student: 'Student',
};

const rowClasses = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
    isActive
      ? 'bg-primary/10 font-semibold text-primary'
      : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
  );

const childClasses = (isActive: boolean) =>
  cn(
    'flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-sm transition-colors',
    isActive
      ? 'font-semibold text-primary'
      : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
  );

interface SidebarProps {
  /** The role's §10.5 nav column, supplied by RoleShell via ConsoleLayout. */
  items: NavItem[];
  /** Closes the off-canvas drawer after a navigation (≤1024px). */
  onNavigate?: () => void;
}

/**
 * Console nav rail: renders whatever column RoleShell resolved (§10.5) —
 * plain links, plus collapsible groups such as "My Project ▾" whose parent
 * toggles the children (it has no route of its own).
 */
export default function Sidebar({ items, onNavigate }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const groupId = useId();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const roleTitle = user ? (ROLE_TITLES[user.role] ?? user.role) : '';

  const signOutNow = () => void signOut(navigate);

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
              <path d="M12 7c1.8-1.4 4.2-2 7-2v13c-2.8 0-5.2-.6-7-2" />
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
          {items.map((item) => {
            const Icon = item.icon;

            if (item.children) {
              const expanded = openGroup === item.label;
              const listId = `${groupId}-${item.label.replace(/\s+/g, '-').toLowerCase()}`;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={listId}
                    onClick={() => setOpenGroup(expanded ? null : item.label)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                    <ChevronDown
                      className={cn(
                        'ml-auto size-4 shrink-0 transition-transform',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded && (
                    <ul id={listId} className="mt-1 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <NavLink
                            to={child.to}
                            onClick={onNavigate}
                            className={({ isActive }) => childClasses(isActive)}
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            }

            return (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) => rowClasses(isActive)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
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
          onClick={signOutNow}
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
