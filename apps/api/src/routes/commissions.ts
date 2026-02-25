import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/security';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import type { CommissionStatus } from '../services/commission/types';
import { ServiceError } from '../services/common/errors';
import { PaymentServiceImpl } from '../services/payment/paymentService';

const router = Router();
const commissionService = new CommissionServiceImpl(db);
const paymentService = new PaymentServiceImpl(db);
const COMMISSION_STATUSES: CommissionStatus[] = [
  'open',
  'completed',
  'cancelled',
];
const COMMISSION_QUERY_FIELDS = ['status', 'forAgents'] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => UUID_PATTERN.test(value);

const assertCommissionIdParam = (value: string) => {
  if (!isUuid(value)) {
    throw new ServiceError(
      'COMMISSION_ID_INVALID',
      'Invalid commission id.',
      400,
    );
  }
};

const assertAllowedQueryFields = (
  query: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  const queryRecord =
    query && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {};
  const unknown = Object.keys(queryRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return queryRecord;
};

const parseCommissionStatus = (
  value: unknown,
): CommissionStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    !(
      typeof value === 'string' &&
      COMMISSION_STATUSES.includes(value as CommissionStatus)
    )
  ) {
    throw new ServiceError(
      'INVALID_COMMISSION_STATUS',
      'Invalid status query parameter.',
      400,
    );
  }
  return value as CommissionStatus;
};

const parseForAgentsFlag = (value: unknown): boolean => {
  if (value === undefined) {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new ServiceError(
    'INVALID_FOR_AGENTS_FLAG',
    'forAgents must be true or false.',
    400,
  );
};

router.post(
  '/commissions',
  requireHuman,
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      const commission = await commissionService.createCommission({
        userId: req.auth?.id as string,
        description: req.body.description,
        referenceImages: req.body.referenceImages,
        rewardAmount: req.body.rewardAmount,
        currency: req.body.currency,
      });

      let paymentIntentId: string | undefined;
      if (commission.paymentStatus === 'pending') {
        const payment = await paymentService.createPaymentIntent(commission.id);
        paymentIntentId = payment.paymentIntentId;
      }

      res.json({ commission, paymentIntentId });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/commissions', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      COMMISSION_QUERY_FIELDS,
      'COMMISSION_INVALID_QUERY_FIELDS',
    );
    const status = parseCommissionStatus(query.status);
    const forAgents = parseForAgentsFlag(query.forAgents);
    const list = await commissionService.listCommissions({ status, forAgents });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/commissions/:id', async (req, res, next) => {
  try {
    assertCommissionIdParam(req.params.id);
    const commission = await commissionService.getCommissionById(req.params.id);
    if (!commission) {
      res.status(404).json({
        error: 'COMMISSION_NOT_FOUND',
        message: 'Commission not found.',
      });
      return;
    }
    const responses = await commissionService.listCommissionResponses(
      commission.id,
    );
    res.json({
      ...commission,
      responses,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/commissions/:id/responses',
  requireVerifiedAgent,
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      assertCommissionIdParam(req.params.id);
      await commissionService.submitResponse(
        req.params.id,
        req.body.draftId,
        req.auth?.id as string,
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/commissions/:id/select-winner',
  requireHuman,
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      assertCommissionIdParam(req.params.id);
      const updated = await commissionService.selectWinner(
        req.params.id,
        req.body.winnerDraftId,
        req.auth?.id as string,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/commissions/:id/pay-intent',
  requireHuman,
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      assertCommissionIdParam(req.params.id);
      const payment = await paymentService.createPaymentIntent(req.params.id);
      res.json(payment);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/commissions/:id/cancel',
  requireHuman,
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      assertCommissionIdParam(req.params.id);
      const updated = await commissionService.cancelCommission(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/payments/webhook',
  sensitiveRateLimiter,
  async (req, res, next) => {
    try {
      const { provider, providerEventId, commissionId, eventType } = req.body;
      const applied = await paymentService.recordWebhookEvent({
        provider,
        providerEventId,
        commissionId,
        eventType,
      });
      res.json({ applied });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
