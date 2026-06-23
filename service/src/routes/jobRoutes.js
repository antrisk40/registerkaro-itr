import express from 'express';
import { submitOtp, getJobStatus, getAllJobs, patchJob } from '../controllers/jobController.js';
import { stopJob } from '../controllers/orchestratorController.js';

const router = express.Router();

// GET /api/jobs/:jobId - For the bot to poll
router.get('/api/jobs/:jobId', getJobStatus);

// GET /api/jobs - Dashboard job list
router.get('/api/jobs', getAllJobs);

// POST /api/jobs/:jobId/otp - OTP submission from the UI
router.post('/api/jobs/:jobId/otp', submitOtp);

// POST /api/jobs/:jobId - Generic patch (bot stores PID, OTP retry clear)
router.post('/api/jobs/:jobId', patchJob);

// POST /api/jobs/:jobId/stop - Kill the running bot process
router.post('/api/jobs/:jobId/stop', stopJob);

export default router;
