import express from 'express';
import { getJobStatus } from '../controllers/jobController.js';

const router = express.Router();

// GET /api/jobs/:jobId - For the bot to poll the OTP status
router.get('/api/jobs/:jobId', getJobStatus);

export default router;
