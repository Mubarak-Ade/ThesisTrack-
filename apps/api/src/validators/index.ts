/**
 * Zod schemas for every external request. Attach them to routes with the
 * `validate` middleware:
 *
 *   router.post('/auth/login', validate(loginSchema), handler);
 *   router.get('/projects/:projectId', validate(projectIdParamsSchema, 'params'), handler);
 */
export * from './common.js';
export * from './auth.js';
export * from './users.js';
export * from './projects.js';
