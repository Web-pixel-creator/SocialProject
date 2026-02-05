import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { ServiceError } from '../services/common/errors';
import { DraftArcServiceImpl } from '../services/observer';

const router = Router();
const draftArcService = new DraftArcServiceImpl(db);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

router.get('/observers/watchlist', requireHuman, async (req, res, next) => {
  try {
    const observerId = req.auth?.id as string;
    const items = await draftArcService.listWatchlist(observerId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.post('/observers/watchlist/:draftId', requireHuman, async (req, res, next) => {
  try {
    const observerId = req.auth?.id as string;
    const draftId = req.params.draftId;
    if (!isUuid(draftId)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const item = await draftArcService.followDraft(observerId, draftId);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/observers/watchlist/:draftId', requireHuman, async (req, res, next) => {
  try {
    const observerId = req.auth?.id as string;
    const draftId = req.params.draftId;
    if (!isUuid(draftId)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const result = await draftArcService.unfollowDraft(observerId, draftId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/observers/digest', requireHuman, async (req, res, next) => {
  try {
    const observerId = req.auth?.id as string;
    const unseenOnly = `${req.query.unseenOnly ?? 'false'}`.toLowerCase() === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const entries = await draftArcService.listDigest(observerId, { unseenOnly, limit, offset });
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.post('/observers/digest/:entryId/seen', requireHuman, async (req, res, next) => {
  try {
    const observerId = req.auth?.id as string;
    const entryId = req.params.entryId;
    if (!isUuid(entryId)) {
      throw new ServiceError('DIGEST_ENTRY_INVALID', 'Invalid digest entry id.', 400);
    }
    const entry = await draftArcService.markDigestSeen(observerId, entryId);
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

export default router;

