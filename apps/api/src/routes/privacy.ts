import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';

const router = Router();
const privacyService = new PrivacyServiceImpl(db);

router.post('/account/export', requireHuman, async (req, res, next) => {
  try {
    const result = await privacyService.requestExport(req.auth?.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/account/exports/:id', requireHuman, async (req, res, next) => {
  try {
    const result = await privacyService.getExportStatus(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/account/delete', requireHuman, async (req, res, next) => {
  try {
    const result = await privacyService.requestDeletion(req.auth?.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
