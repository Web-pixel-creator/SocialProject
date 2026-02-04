import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!env.ADMIN_API_TOKEN) {
    return res.status(503).json({ error: 'ADMIN_TOKEN_NOT_CONFIGURED' });
  }

  const token = req.headers['x-admin-token'];
  if (!token || token !== env.ADMIN_API_TOKEN) {
    return res.status(403).json({ error: 'ADMIN_TOKEN_INVALID' });
  }

  return next();
};
