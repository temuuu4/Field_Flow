import { Router } from 'express';
import { getDriverPresence } from '../controllers/journeyController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// Driver presence is read by operators/admins and by the driver themselves.
// Drivers may only query their own presence; operators/admins may query any driver.
router.get('/:driverId', authenticate, requireRole(roles.driverOrOperatorOrAdmin), getDriverPresence);

export default router;
