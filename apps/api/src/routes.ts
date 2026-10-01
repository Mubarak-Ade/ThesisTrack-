import { Router } from 'express';

import healthRoutes from './routes/health.js';
import { routes as authRoutes } from './modules/auth/index.js';
import { routes as usersRoutes } from './modules/users/index.js';
import { routes as projectsRoutes } from './modules/projects/index.js';
import { routes as supervisorAssignmentsRoutes } from './modules/supervisor-assignments/index.js';
import { routes as proposalsRoutes } from './modules/proposals/index.js';

/**
 * Central route composition. `app.ts` only ever sees a single `/api/v1`
 * entry point; each module exposes its router through `modules/<name>/routes.ts`
 * (re-exported by `modules/<name>/index.ts`).
 *
 *   /api/v1/health    →  routes/health.ts
 *   /api/v1/auth/…    →  modules/auth
 *   /api/v1/users     →  modules/users
 *   /api/v1/projects  →  modules/projects
 *   /api/v1/projects/:id/supervisor → modules/supervisor-assignments
 *   /api/v1/proposals/… + /api/v1/proposal-attachments/… → modules/proposals
 */
export const routes = Router();

const api = Router();
api.use(healthRoutes);
api.use('/auth', authRoutes);
api.use(usersRoutes);
api.use(projectsRoutes);
api.use(supervisorAssignmentsRoutes);
api.use(proposalsRoutes);

routes.use('/api/v1', api);

export default routes;
