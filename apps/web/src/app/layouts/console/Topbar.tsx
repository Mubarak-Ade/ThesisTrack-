import { Menu, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';

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
        <div className="relative hidden w-64 sm:block lg:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input aria-label="Search" placeholder="Search…" className="h-10 pl-9" />
        </div>

        <div className="ml-auto min-w-0 text-right">
          <p className="truncate text-[11px] font-bold uppercase tracking-widest text-primary">
            {role ? (ROLE_LABELS[role] ?? role.toUpperCase()) : 'USER'} SESSION
          </p>
          <p className="truncate text-xs text-muted-foreground">Department of Informatics</p>
        </div>
      </div>
    </header>
  );
}
