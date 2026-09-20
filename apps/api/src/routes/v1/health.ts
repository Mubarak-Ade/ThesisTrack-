import { Router, Request, Response } from 'express';
import { respond } from '../../lib/response.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  respond(res, 200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
