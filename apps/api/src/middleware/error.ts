import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import { AuthError } from '../services/auth/errors';
import { BudgetError } from '../services/budget/errors';
import { ServiceError } from '../services/common/errors';

const recordErrorEvent = async (
  req: Request,
  errorCode: string,
  message: string,
  status: number,
  metadata: Record<string, unknown>,
) => {
  try {
    const userType = req.auth?.role ?? 'anonymous';
    const userId = req.auth?.id ?? null;
    await db.query(
      `INSERT INTO error_events (error_code, message, status, route, method, user_type, user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        errorCode,
        message,
        status,
        req.originalUrl,
        req.method,
        userType,
        userId,
        metadata,
      ],
    );
  } catch (recordError) {
    logger.error(
      { err: recordError, code: errorCode },
      'Error event record failed',
    );
  }
};

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const isHandled =
    error instanceof AuthError ||
    error instanceof BudgetError ||
    error instanceof ServiceError;
  const status = error?.status ?? (isHandled ? 400 : 500);
  const errorCode = isHandled ? error.code : 'INTERNAL_ERROR';
  const message = isHandled
    ? error.message
    : (error?.message ?? 'Unexpected error');
  const metadata: Record<string, unknown> = {};

  if (error instanceof BudgetError) {
    metadata.limit = error.limit;
    metadata.limitType = error.limitType;
  }
  if (error instanceof AuthError) {
    metadata.auth = true;
  }
  if (error instanceof ServiceError) {
    metadata.service = true;
  }

  recordErrorEvent(req, errorCode, message, status, metadata);

  if (
    error instanceof AuthError ||
    error instanceof BudgetError ||
    error instanceof ServiceError
  ) {
    logger.warn({ err: error, code: error.code }, 'Handled service error');
    res.status(status).json({
      error: errorCode,
      message,
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  res.status(status).json({
    error: errorCode,
    message,
  });
};
