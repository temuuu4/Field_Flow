import { Router } from 'express';
import { createRoute, createRouteStop, deleteRoute, deleteRouteStop, getRoute, getRouteStops, getRoutes, updateRoute, updateRouteStop } from '../controllers/routeController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// All route management endpoints require authentication. Mutations are
// restricted to operators and admins; reads are open to all authenticated users
// (so drivers can fetch their assigned routes).
router.use(authenticate);

router.get('/', getRoutes);
router.get('/:id', getRoute);
router.get('/:routeId/stops', getRouteStops);

router.post('/', requireRole(roles.operatorOrAdmin), createRoute);
router.patch('/:id', requireRole(roles.operatorOrAdmin), updateRoute);
router.delete('/:id', requireRole(roles.operatorOrAdmin), deleteRoute);

router.post('/:routeId/stops', requireRole(roles.operatorOrAdmin), createRouteStop);
router.patch('/:routeId/stops/:stopId', requireRole(roles.operatorOrAdmin), updateRouteStop);
router.delete('/:routeId/stops/:stopId', requireRole(roles.operatorOrAdmin), deleteRouteStop);

export default router;
