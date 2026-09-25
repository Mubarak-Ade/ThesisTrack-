/**
 * Dashboard repository (spec §4): the only data import site for the
 * Coordinator Dashboard. Currently fixture-backed; a live endpoint drops in
 * behind this function without touching any screen.
 */
import { DASHBOARD_FIXTURES } from './mock/fixtures';
import type { DashboardData } from './types';

export async function getDashboard(): Promise<DashboardData> {
  return DASHBOARD_FIXTURES;
}
