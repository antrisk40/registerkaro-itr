import express from 'express';
import { handleWebhookEvent, streamJobEvents } from '../controllers/eventController.js';
import { authenticate, requireUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/webhook/events', handleWebhookEvent);
router.get('/api/stream/:jobId', authenticate, requireUser, streamJobEvents);

export default router;
