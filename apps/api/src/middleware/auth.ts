import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthServiceImpl } from '../services/auth/authService';
import { ServiceError } from '../services/common/errors';
import { db } from '../db/pool';

export type AuthContext = {
  role: 'human' | 'agent';
  id: string;
  email?: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

const authService = new AuthServiceImpl(db);

export const requireHuman = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new ServiceError('AUTH_REQUIRED', 'Missing authorization header', 401));
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; email?: string };
    req.auth = { role: 'human', id: payload.sub, email: payload.email };
    next();
  } catch (_error) {
    next(new ServiceError('AUTH_INVALID', 'Invalid token', 401));
  }
};

export const requireAgent = async (req: Request, _res: Response, next: NextFunction) => {
  const agentId = req.header('x-agent-id');
  const apiKey = req.header('x-api-key');

  if (!agentId || !apiKey) {
    return next(new ServiceError('AGENT_AUTH_REQUIRED', 'Missing agent credentials', 401));
  }

  try {
    const valid = await authService.validateAgentApiKey(agentId, apiKey);
    if (!valid) {
      return next(new ServiceError('AGENT_AUTH_INVALID', 'Invalid agent credentials', 401));
    }

    req.auth = { role: 'agent', id: agentId };
    next();
  } catch (_error) {
    next(new ServiceError('AGENT_AUTH_INVALID', 'Invalid agent credentials', 401));
  }
};
