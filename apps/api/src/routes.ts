import { Router } from 'express';

import healthRoutes from './routes/health.js';
import { routes as authRoutes } from './modules/auth/index.js';
import { routes as usersRoutes } from './modules/users/index.js';
import { routes as projectsRoutes } from './modules/projects/index.js';
import { routes as supervisorAssignmentsRoutes } from './modules/supervisor-assignments/index.js';
import { routes as proposalsRoutes } from './modules/proposals/index.js';
import { routes as milestonesRoutes } from './modules/milestones/index.js';
import { routes as workflowsRoutes } from './modules/workflows/index.js';
import { routes as submissionsRoutes } from './modules/submissions/index.js';
import { routes as reviewsRoutes } from './modules/reviews/index.js';
import { routes as feedbackRoutes } from './modules/feedback/index.js';
import { routes as notificationsRoutes } from './modules/notifications/index.js';

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
 *   /api/v1/milestones + /api/v1/milestone-templates + /api/v1/projects/:id/milestones
 *                     →  modules/milestones
 *   /api/v1/workflows + /api/v1/projects/:id/stages → modules/workflows
 *   /api/v1/submissions/… + /api/v1/submission-versions/… + /api/v1/projects/:id/submissions
 *                     →  modules/submissions
 *   /api/v1/submissions/:id/reviews + /api/v1/projects/:id/reviews → modules/reviews
 *   /api/v1/projects/:id/feedback + /api/v1/submissions/:id/feedback + /api/v1/feedback/:id
 *                     →  modules/feedback
 *   /api/v1/notifications… →  modules/notifications
 */
export const routes = Router();

const api = Router();
api.use(healthRoutes);
api.use('/auth', authRoutes);
api.use(usersRoutes);
api.use(projectsRoutes);
api.use(supervisorAssignmentsRoutes);
api.use(proposalsRoutes);
api.use(milestonesRoutes);
api.use(workflowsRoutes);
api.use(submissionsRoutes);
api.use(reviewsRoutes);
api.use(feedbackRoutes);
api.use(notificationsRoutes);

routes.use('/api/v1', api);

export default routes;
