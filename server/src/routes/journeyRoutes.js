import { Router } from 'express';
import { arriveJourney, endJourney, getActiveDriverTask, getJourney, getJourneyHistory, getJourneys, startJourney, updateJourneyLocation } from '../controllers/journeyController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// All journey endpoints require authentication. Journey lifecycle is driver
// driven; reads are open to any authenticated user.
router.use(authenticate);

router.get('/', getJourneys);
router.get('/active-task', requireRole(roles.driverOnly), getActiveDriverTask);
router.get('/:id', getJourney);
router.get('/:id/history', getJourneyHistory);

router.post('/start', requireRole(roles.driverOrOperatorOrAdmin), startJourney);
router.post('/:id/arrive', requireRole(roles.driverOrOperatorOrAdmin), arriveJourney);
router.post('/:id/end', requireRole(roles.driverOrOperatorOrAdmin), endJourney);
router.post('/:id/location', requireRole(roles.driverOrOperatorOrAdmin), updateJourneyLocation);

export default router;
