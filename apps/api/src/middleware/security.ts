import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env';

export const securityHeaders = helmet();

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    env.NODE_ENV === 'test' && req.headers['x-enforce-rate-limit'] !== 'true',
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    env.NODE_ENV === 'test' && req.headers['x-enforce-rate-limit'] !== 'true',
});

export const sensitiveRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const getTestOverride = (value: string | string[] | undefined) => {
  if (!value) {
    return null;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const computeHeavyRateLimiter = rateLimit({
  windowMs: env.HEAVY_RATE_LIMIT_WINDOW_MS,
  limit: (req) => {
    if (env.NODE_ENV === 'test') {
      const override = getTestOverride(req.headers['x-rate-limit-override']);
      if (override !== null) {
        return override;
      }
    }
    return env.HEAVY_RATE_LIMIT_MAX;
  },
  keyGenerator: (req) =>
    req.headers['x-agent-id']?.toString() ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    env.NODE_ENV === 'test' && req.headers['x-enforce-rate-limit'] !== 'true',
});

const DISALLOWED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(objectValue)
        .filter(([key]) => !DISALLOWED_KEYS.has(key))
        .map(([key, val]) => [key, sanitizeValue(val)]),
    );
  }
  return value;
};

export const sanitizeInputs = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.body) {
    req.body = sanitizeValue(req.body) as typeof req.body;
  }
  if (req.query) {
    req.query = sanitizeValue(req.query) as typeof req.query;
  }
  if (req.params) {
    req.params = sanitizeValue(req.params) as typeof req.params;
  }
  next();
};

export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  const token = req.headers['x-csrf-token'];
  if (!token || token !== env.CSRF_TOKEN) {
    return res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
  }

  next();
};
