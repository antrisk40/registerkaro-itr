import express from 'express';
import { getJobStatus, submitOtp } from '../controllers/jobController.js';

const router = express.Router();

// GET /api/jobs/:jobId - For the bot to poll the OTP status
router.get('/api/jobs/:jobId', getJobStatus);

// POST /api/jobs/:jobId/otp - For the UI to submit the OTP
router.post('/api/jobs/:jobId/otp', submitOtp);

export default router;
