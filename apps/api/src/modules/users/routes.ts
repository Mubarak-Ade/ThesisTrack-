import { Router } from 'express';

import { requireAdmin } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { createUserSchema } from './schema.js';

const router = Router();

router.post('/users', requireAdmin(), validate(createUserSchema), controller.create);

export default router;
