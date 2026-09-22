/**
 * Reusable authorization layer — every future module builds on this.
 *
 * Layer order on every route (backend authorization is authoritative;
 * hiding frontend buttons is not authorization):
 *
 *   Authentication      middleware/auth.ts (global — who are you?)
 *         ↓
 *   RBAC                requireRole() / requireAdmin() (what may your role do?)
 *         ↓
 *   Resource            requireProjectOwner() / requireSupervisorAssignment()
 *                       requireProjectAccess() / anyOf() (which resources are yours?)
 *         ↓
 *   Workflow            requireWorkflow() (which state transitions may you perform?)
 *         ↓
 *   Handler
 *
 * Example:
 *   router.post(
 *     '/projects/:projectId/proposals',
 *     requireRole('student'),
 *     requireProjectOwner(),
 *     requireWorkflow({ resource: 'Proposal', load: …, action: …, transitions: …, roles: … }),
 *     asyncHandler(async (req, res) => { … }),
 *   );
 */
export * from './guards.js';
export * from './compose.js';
export * from './access.js';
export * from './resource.js';
export * from './workflow.js';
