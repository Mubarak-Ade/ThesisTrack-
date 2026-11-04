import { Router } from 'express';

import {
  requireDepartmentScope,
  requireProjectAccess,
  requireRole,
  requireStudentAccess,
} from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  assignSupervisorSchema,
  assignmentParamsSchema,
  studentAssignmentParamsSchema,
} from './schema.js';

const router = Router();

router.use(requireDepartmentScope());

/**
 * GET — who supervises this project? Visible to the project's participants
 * (owner student, assigned supervisor) and admins; writes are admin/coordinator.
 */
router.get(
  '/projects/:projectId/supervisor',
  validate(assignmentParamsSchema, 'params'),
  requireProjectAccess(),
  controller.show,
);

router.post(
  '/projects/:projectId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(assignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.assign,
);

router.patch(
  '/projects/:projectId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(assignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.change,
);

router.delete(
  '/projects/:projectId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(assignmentParamsSchema, 'params'),
  controller.end,
);

/*
 * Student-scoped assignment routes (§11). The read is deliberately wider than
 * the project read: the student themself, their ACTIVE supervisor, or an admin.
 * The three writes are admin/coordinator-scoped.
 */

router.get(
  '/students/:studentId/supervisor',
  validate(studentAssignmentParamsSchema, 'params'),
  requireStudentAccess(),
  controller.showForStudent,
);

router.post(
  '/students/:studentId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(studentAssignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.assignForStudent,
);

router.patch(
  '/students/:studentId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(studentAssignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.changeForStudent,
);

router.delete(
  '/students/:studentId/supervisor',
  requireRole('administrator', 'coordinator'),
  validate(studentAssignmentParamsSchema, 'params'),
  controller.endForStudent,
);

// The caseload: the supervisor's own students, no id in the path (§11).
router.get('/supervisors/me/students', requireRole('supervisor'), controller.caseload);

export default router;
