import { Router } from 'express';
import { acceptAssignment, arriveAssignmentStop, completeAssignmentStop, createAssignment, deleteAssignment, getAssignment, getAssignmentStops, getAssignments, skipAssignmentStop, startAssignmentStop, updateAssignment } from '../controllers/assignmentController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// All assignment endpoints require authentication. Creating/deleting
// assignments is restricted to operators/admins. Drivers can read their
// own assignments and update stop progress.
router.use(authenticate);

router.get('/', getAssignments);
router.get('/:id', getAssignment);
router.get('/:assignmentId/stops', getAssignmentStops);

router.post('/', requireRole(roles.operatorOrAdmin), createAssignment);
router.delete('/:id', requireRole(roles.operatorOrAdmin), deleteAssignment);
router.post('/:id/accept', requireRole(roles.driverOrOperatorOrAdmin), acceptAssignment);

// Stop progress and assignment updates (e.g. decline) are driven by
// drivers; operators/admins can also perform these. The controller's
// `assertAssignmentVisibleToCaller` enforces object-level ownership so
// drivers can only PATCH their own assignments.
router.post('/:assignmentId/stops/:stopId/start', requireRole(roles.driverOrOperatorOrAdmin), startAssignmentStop);
router.post('/:assignmentId/stops/:stopId/arrive', requireRole(roles.driverOrOperatorOrAdmin), arriveAssignmentStop);
router.post('/:assignmentId/stops/:stopId/complete', requireRole(roles.driverOrOperatorOrAdmin), completeAssignmentStop);
router.post('/:assignmentId/stops/:stopId/skip', requireRole(roles.driverOrOperatorOrAdmin), skipAssignmentStop);
router.patch('/:id', requireRole(roles.driverOrOperatorOrAdmin), updateAssignment);

export default router;
