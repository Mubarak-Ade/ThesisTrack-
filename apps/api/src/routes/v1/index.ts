import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import usersRoutes from './users.js';
import projectsRoutes from './projects.js';

const router = Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use(usersRoutes);
router.use(projectsRoutes);

export default router;
