import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';

import { cn } from '@/lib/utils';
import ConsoleFooter from './console/ConsoleFooter';
import Sidebar from './console/Sidebar';
import Topbar from './console/Topbar';

/**
 * Admin-console shell (spec §2/§3): ≥1025px static sidebar; ≤1024px it
 * collapses to an off-canvas drawer toggled by the topbar hamburger.
 * Mounts the sonner <Toaster> once for every console screen.
 */
export default function ConsoleLayout() {
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
        <Sidebar onNavigate={closeDrawer} />
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
