import { NextFunction, Request, Response } from 'express';
import { AuthError } from '../services/auth/errors';
import { BudgetError } from '../services/budget/errors';
import { ServiceError } from '../services/common/errors';
import { logger } from '../logging/logger';

export const errorHandler = (
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof AuthError || error instanceof BudgetError || error instanceof ServiceError) {
    logger.warn({ err: error, code: error.code }, 'Handled service error');
    res.status(error.status ?? 400).json({
      error: error.code,
      message: error.message
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: error?.message ?? 'Unexpected error'
  });
};
