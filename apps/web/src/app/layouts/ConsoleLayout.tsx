import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';

import { cn } from '@/lib/utils';
import type { NavItem } from './console/nav';
import ConsoleFooter from './console/ConsoleFooter';
import Sidebar from './console/Sidebar';
import Topbar from './console/Topbar';

interface ConsoleLayoutProps {
  /** The role's §10.5 nav column — RoleShell resolves it (§10.3). */
  nav: NavItem[];
}

/**
 * Console shell (spec §10.3/§16.1): ≥1025px static sidebar; ≤1024px it
 * collapses to an off-canvas drawer toggled by the topbar hamburger. The
 * nav comes from the caller — the same chrome serves all three roles with
 * role-specific columns. Mounts the sonner <Toaster> once for every screen.
 */
export default function ConsoleLayout({ nav }: ConsoleLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Off-canvas backdrop (small screens only). */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeDrawer}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <aside
        aria-label="Sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-200 ease-out lg:translate-x-0',
          drawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <Sidebar items={nav} onNavigate={closeDrawer} />
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="flex-1">
          <Outlet />
        </main>
        <ConsoleFooter />
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
