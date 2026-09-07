import { Router } from 'express';
import { getNotification, getNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/protect.js';

const router = Router();

// Notifications are scoped to the authenticated user. A user can only see and
// modify their own notifications.
router.use(authenticate);

router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.get('/:id', getNotification);
router.patch('/:id/read', markNotificationRead);

export default router;
