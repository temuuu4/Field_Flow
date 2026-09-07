import { Router } from 'express';
import { createUser, deactivateUser, getUser, getUsers, updateUser } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/protect.js';
import { roles } from '../middleware/protect.js';

const router = Router();

// All user management endpoints require authentication. Creating/updating and
// deactivating users is restricted to IT_ADMIN. Reading is open to operators
// and admins. Drivers can read their own profile via /api/auth/me.
router.use(authenticate);
router.get('/', requireRole(roles.operatorOrAdmin), getUsers);
router.get('/:id', requireRole(roles.operatorOrAdmin), getUser);
router.post('/', requireRole(roles.adminOnly), createUser);
router.patch('/:id', requireRole(roles.adminOnly), updateUser);
router.patch('/:id/deactivate', requireRole(roles.adminOnly), deactivateUser);

export default router;
