import express from 'express';
import { handleWebhookEvent, streamJobEvents } from '../controllers/eventController.js';

const router = express.Router();

// POST /webhook/events - For the Playwright bot to send updates
router.post('/webhook/events', handleWebhookEvent);

// GET /api/stream/:jobId - For the Next.js UI to listen to updates via SSE
router.get('/api/stream/:jobId', streamJobEvents);

export default router;
