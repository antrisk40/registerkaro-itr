import express from 'express';
import { submitOtp, getJobStatus, getAllJobs, patchJob, requestResendOtp } from '../controllers/jobController.js';
import { launchJob, stopJob, cloneJob } from '../controllers/orchestratorController.js';

const router = express.Router();

// POST /api/jobs/launch - Launch a new bot instance (MUST BE BEFORE /:jobId)
router.post('/api/jobs/launch', launchJob);

// GET /api/jobs/:jobId - For the bot to poll
router.get('/api/jobs/:jobId', getJobStatus);

// GET /api/jobs - Dashboard job list
router.get('/api/jobs', getAllJobs);

// POST /api/jobs/:jobId/otp - OTP submission from the UI
router.post('/api/jobs/:jobId/otp', submitOtp);

// POST /api/jobs/:jobId/resend-otp - Ask bot to click Resend on portal
router.post('/api/jobs/:jobId/resend-otp', requestResendOtp);

// POST /api/jobs/:jobId - Generic patch (bot stores PID, OTP retry clear)
router.post('/api/jobs/:jobId', patchJob);

// POST /api/jobs/:jobId/stop - Kill the running bot process
router.post('/api/jobs/:jobId/stop', stopJob);

// POST /api/jobs/:jobId/clone - Restart a stopped/failed job
router.post('/api/jobs/:jobId/clone', cloneJob);

export default router;
