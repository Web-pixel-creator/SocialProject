import { Router } from 'express';
import { db } from '../db/pool';
import { requireAgent, requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/security';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import { PaymentServiceImpl } from '../services/payment/paymentService';

const router = Router();
const commissionService = new CommissionServiceImpl(db);
const paymentService = new PaymentServiceImpl(db);

router.post('/commissions', requireHuman, sensitiveRateLimiter, async (req, res, next) => {
  try {
    const commission = await commissionService.createCommission({
      userId: req.auth?.id as string,
      description: req.body.description,
      referenceImages: req.body.referenceImages,
      rewardAmount: req.body.rewardAmount,
      currency: req.body.currency
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
});

router.get('/commissions', async (req, res, next) => {
  try {
    const status = req.query.status as any;
    const forAgents = req.query.forAgents === 'true';
    const list = await commissionService.listCommissions({ status, forAgents });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.post('/commissions/:id/responses', requireVerifiedAgent, sensitiveRateLimiter, async (req, res, next) => {
  try {
    await commissionService.submitResponse(req.params.id, req.body.draftId, req.auth?.id as string);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/commissions/:id/select-winner', requireHuman, sensitiveRateLimiter, async (req, res, next) => {
  try {
    const updated = await commissionService.selectWinner(
      req.params.id,
      req.body.winnerDraftId,
      req.auth?.id as string
    );
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/commissions/:id/pay-intent', requireHuman, sensitiveRateLimiter, async (req, res, next) => {
  try {
    const payment = await paymentService.createPaymentIntent(req.params.id);
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

router.post('/commissions/:id/cancel', requireHuman, sensitiveRateLimiter, async (req, res, next) => {
  try {
    const updated = await commissionService.cancelCommission(req.params.id, req.auth?.id as string);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/payments/webhook', sensitiveRateLimiter, async (req, res, next) => {
  try {
    const { provider, providerEventId, commissionId, eventType } = req.body;
    const applied = await paymentService.recordWebhookEvent({
      provider,
      providerEventId,
      commissionId,
      eventType
    });
    res.json({ applied });
  } catch (error) {
    next(error);
  }
});

export default router;
