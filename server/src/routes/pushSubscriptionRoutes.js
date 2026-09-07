import { Router } from 'express';
import { deletePushSubscription, getPushSubscriptions, registerPushSubscription, updatePushSubscription } from '../controllers/pushSubscriptionController.js';
import { authenticate } from '../middleware/protect.js';

const router = Router();

// The VAPID public key is intentionally public (clients need it to subscribe).
// All other push-subscription operations require authentication.
router.get('/vapid-public-key', (request, response) => {
  response.json({ success: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY || '' } });
});

router.use(authenticate);
router.post('/', registerPushSubscription);
router.get('/', getPushSubscriptions);
router.patch('/:id', updatePushSubscription);
router.delete('/:id', deletePushSubscription);

export default router;
