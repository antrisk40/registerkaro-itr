import express from 'express';
import { submitOtp, getJobStatus, getAllJobs } from '../controllers/jobController.js';

const router = express.Router();

// GET /api/jobs/:jobId - For the bot to// Polling endpoint for Playwright bot
router.get('/api/jobs/:jobId', getJobStatus);

// Endpoint for Next.js Admin Dashboard to fetch all jobs
router.get('/api/jobs', getAllJobs);

// POST /api/jobs/:jobId/otp - For the UI to submit the OTP
router.post('/api/jobs/:jobId/otp', submitOtp);

export default router;
