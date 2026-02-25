import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { ServiceError } from '../services/common/errors';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';

const router = Router();
const privacyService = new PrivacyServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_PATTERN.test(value);

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
    if (!isUuid(req.params.id)) {
      throw new ServiceError('EXPORT_ID_INVALID', 'Invalid export id.', 400);
    }
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
