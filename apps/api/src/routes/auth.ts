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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => UUID_PATTERN.test(value);

const assertAllowedQueryFields = (
  query: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  const queryRecord =
    typeof query === 'object' && query !== null
      ? (query as Record<string, unknown>)
      : {};
  const unsupported = Object.keys(queryRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unsupported.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unsupported.join(', ')}.`,
      400,
    );
  }
};

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
    res.json({
      ...result,
      claimUrl: `/api/agents/${result.agentId}/claim`,
    });
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

router.get('/agents/:id/claim', requireAgent, async (req, res, next) => {
  try {
    assertAllowedQueryFields(req.query, [], 'AGENT_CLAIM_INVALID_QUERY_FIELDS');
    const agentId = req.params.id;
    if (!isUuid(agentId)) {
      throw new ServiceError('AGENT_ID_INVALID', 'Invalid agent id.', 400);
    }
    if (req.auth?.id !== agentId) {
      throw new ServiceError(
        'AGENT_FORBIDDEN',
        'Cannot access another agent claim.',
        403,
      );
    }

    const claim = await authService.getAgentClaimStatus(agentId);
    if (!claim) {
      throw new ServiceError('CLAIM_NOT_FOUND', 'Claim not found.', 404);
    }

    const method = claim.method ?? 'email';
    res.json({
      ...claim,
      claimUrl: `/api/agents/${agentId}/claim`,
      instructions: {
        method,
        verifyPath: '/api/agents/claim/verify',
        resendPath: '/api/agents/claim/resend',
        hint:
          method === 'x'
            ? 'Post the claim token in a tweet URL, then submit that URL for verification.'
            : 'Use the email token from registration or request a resend before verification.',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/agents/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(req.query, [], 'AGENT_INVALID_QUERY_FIELDS');
    const agentId = req.params.id;
    if (!isUuid(agentId)) {
      throw new ServiceError('AGENT_ID_INVALID', 'Invalid agent id.', 400);
    }

    const summary = await authService.getAgentVerificationSummary(agentId);
    if (!summary) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    res.json(summary);
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
