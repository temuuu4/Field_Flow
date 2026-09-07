import { Router } from 'express';
import { approveSample, createSample, deleteSample, getSample, getSamples, rejectSample, submitSample, updateSample } from '../controllers/sampleController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// All sample endpoints require authentication. Drivers create and submit
// samples; operators/admins approve, reject, edit, or delete.
router.use(authenticate);

router.get('/', getSamples);
router.get('/:id', getSample);

router.post('/', requireRole(roles.driverOrOperatorOrAdmin), createSample);
router.patch('/:id', requireRole(roles.operatorOrAdmin), updateSample);
router.delete('/:id', requireRole(roles.operatorOrAdmin), deleteSample);
router.post('/:id/submit', requireRole(roles.driverOrOperatorOrAdmin), submitSample);
router.post('/:id/approve', requireRole(roles.operatorOrAdmin), approveSample);
router.post('/:id/reject', requireRole(roles.operatorOrAdmin), rejectSample);

export default router;
