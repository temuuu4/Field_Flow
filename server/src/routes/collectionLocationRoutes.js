import { Router } from 'express';
import { createCollectionLocation, getCollectionLocation, listCollectionLocations } from '../controllers/collectionLocationController.js';
import { authenticate, requireRole, roles } from '../middleware/protect.js';

const router = Router();

// All collection-location endpoints require authentication. Reads are open to
// any authenticated user; creating collection locations is restricted to
// operators and admins.
router.use(authenticate);

router.get('/', listCollectionLocations);
router.get('/:id', getCollectionLocation);
router.post('/', requireRole(roles.operatorOrAdmin), createCollectionLocation);

export default router;
