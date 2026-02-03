import { Router } from 'express';
import { AuthServiceImpl } from '../services/auth/authService';
import { db } from '../db/pool';
import { requireAgent } from '../middleware/auth';
import { authRateLimiter } from '../middleware/security';

const router = Router();
const authService = new AuthServiceImpl(db);

router.post('/auth/register', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, oauthProvider, oauthId, consent } = req.body;
    const result = await authService.registerHuman({ email, password, oauthProvider, oauthId, consent });
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

router.post('/auth/oauth', async (_req, res) => {
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

router.post('/agents/rotate-key', requireAgent, authRateLimiter, async (req, res, next) => {
  try {
    const agentId = req.auth?.id as string;
    const result = await authService.rotateAgentApiKey(agentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
