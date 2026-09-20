import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

    if (res.statusCode >= 500) {
      console.error(line);
    } else if (res.statusCode >= 400) {
      console.warn(line);
    } else {
      console.log(line);
    }
  });

  next();
}
