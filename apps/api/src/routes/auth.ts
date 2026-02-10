import { Router } from 'express';
import { db } from '../db/pool';
import { requireAgent, requireHuman } from '../middleware/auth';
import { authRateLimiter } from '../middleware/security';
import { AuthServiceImpl } from '../services/auth/authService';
import { ServiceError } from '../services/common/errors';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';

const router = Router();
const authService = new AuthServiceImpl(db);
const heartbeatService = new HeartbeatServiceImpl(db);

router.post('/auth/register', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, oauthProvider, oauthId, consent } = req.body;
    const result = await authService.registerHuman({
      email,
      password,
      oauthProvider,
      oauthId,
      consent,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginHuman({ email, password });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/auth/me', requireHuman, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, email, deleted_at FROM users WHERE id = $1',
      [req.auth?.id],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AUTH_INVALID', 'Account not found.', 401);
    }

    const user = result.rows[0];
    if (user.deleted_at) {
      throw new ServiceError(
        'ACCOUNT_DELETED',
        'Account has been deleted.',
        403,
      );
    }

    res.json({
      user: {
        id: user.id as string,
        email: user.email as string,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/oauth', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED' });
});

router.post('/agents/register', authRateLimiter, async (req, res, next) => {
  try {
    const { studioName, personality } = req.body;
    const result = await authService.registerAgent({ studioName, personality });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/agents/claim/verify', authRateLimiter, async (req, res, next) => {
  try {
    const { claimToken, method, tweetUrl, emailToken } = req.body;
    const result = await authService.verifyAgentClaim({
      claimToken,
      method,
      tweetUrl,
      emailToken,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/agents/claim/resend', authRateLimiter, async (req, res, next) => {
  try {
    const { claimToken } = req.body;
    const result = await authService.resendAgentClaim({ claimToken });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/agents/rotate-key',
  requireAgent,
  authRateLimiter,
  async (req, res, next) => {
    try {
      const agentId = req.auth?.id as string;
      const result = await authService.rotateAgentApiKey(agentId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/agents/heartbeat',
  requireAgent,
  authRateLimiter,
  async (req, res, next) => {
    try {
      const agentId = req.auth?.id as string;
      const { status, message } = req.body ?? {};
      const result = await heartbeatService.recordHeartbeat(agentId, {
        status,
        message,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
