import { Router } from 'express';

import { requireRole } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  listLibraryQuerySchema,
  projectLibraryParamsSchema,
  similarityCheckSchema,
} from './schema.js';

const router = Router();

/**
 * ADR-18's narrow coordinator exception: the library is the one institution-wide
 * READ granted to a coordinator. This router deliberately does NOT install
 * `requireDepartmentScope()`. Every other module keeps its ADR-17 scoping — do
 * not copy this omission anywhere else.
 *
 * A student is refused by role; an unauthenticated request is refused by the
 * global authenticator before it reaches here.
 */
const LIBRARY_READERS = ['supervisor', 'coordinator', 'administrator'] as const;

router.get(
  '/project-library',
  requireRole(...LIBRARY_READERS),
  validate(listLibraryQuerySchema, 'query'),
  controller.list,
);

router.post(
  '/project-library/similarity-check',
  requireRole(...LIBRARY_READERS),
  validate(similarityCheckSchema),
  controller.similarityCheck,
);

router.get(
  '/project-library/:projectId',
  requireRole(...LIBRARY_READERS),
  validate(projectLibraryParamsSchema, 'params'),
  controller.show,
);

export default router;
