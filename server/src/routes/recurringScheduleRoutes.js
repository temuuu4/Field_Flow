import { Router } from 'express';
import { createRecurringSchedule, deleteRecurringSchedule, generateRecurringAssignments, generateRecurringScheduleAssignments, getRecurringSchedule, getRecurringSchedules, updateRecurringSchedule } from '../controllers/recurringScheduleController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// Recurring schedules are operator/admin functionality.
router.use(authenticate);

router.get('/', getRecurringSchedules);
router.get('/:id', getRecurringSchedule);

router.post('/', requireRole(roles.operatorOrAdmin), createRecurringSchedule);
router.post('/generate', requireRole(roles.operatorOrAdmin), generateRecurringAssignments);
router.post('/:id/generate', requireRole(roles.operatorOrAdmin), generateRecurringScheduleAssignments);
router.patch('/:id', requireRole(roles.operatorOrAdmin), updateRecurringSchedule);
router.delete('/:id', requireRole(roles.operatorOrAdmin), deleteRecurringSchedule);

export default router;
