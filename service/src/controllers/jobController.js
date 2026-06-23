import Job from '../models/jobSchema.js';
import { encrypt, decrypt } from '../utils/crypto.js';

export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Strip the encrypted blob — never expose it; use /reveal-password instead
    const { encryptedPassword, ...safeJob } = job;
    safeJob.hasPassword = !!encryptedPassword; // tells UI whether to show the Reveal button

    return res.status(200).json({ job: safeJob });
  } catch (error) {
    console.error('[Jobs] Error fetching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllJobs = async (req, res) => {
  try {
    const jobs = await Job.find({}).sort({ updatedAt: -1 }).lean();
    // Strip encrypted blobs from list view
    const safeJobs = jobs.map(({ encryptedPassword, ...j }) => ({
      ...j,
      hasPassword: !!encryptedPassword,
    }));
    return res.status(200).json({ jobs: safeJobs });
  } catch (error) {
    console.error('[Jobs] Error fetching all jobs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/jobs/:jobId/reveal-password
 * Decrypts the stored AES-256 password on-the-fly for authorized operators.
 */
export const revealPassword = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!job.encryptedPassword) return res.status(404).json({ error: 'No password stored for this job' });

    const plainPassword = decrypt(job.encryptedPassword);
    if (plainPassword === 'DECRYPTION_FAILED') {
      return res.status(500).json({ error: 'Decryption failed — check ENCRYPTION_KEY in service/.env' });
    }

    return res.status(200).json({ password: plainPassword });
  } catch (error) {
    console.error('[Jobs] Error revealing password:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitOtp = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required' });

    const job = await Job.findByIdAndUpdate(
      jobId,
      { suppliedOtp: otp, lastOtpError: null, updatedAt: Date.now() },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[Jobs] Error submitting OTP:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestResendOtp = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findByIdAndUpdate(
      jobId,
      { $set: { resendOtpRequested: true, suppliedOtp: null, lastOtpError: null, updatedAt: Date.now() } },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[Jobs] Error requesting OTP resend:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/jobs/:jobId
 * Generic patcher used by the bot.
 * If the bot sends `recoveredPassword` (plain text), we encrypt it here
 * before writing to MongoDB.
 */
export const patchJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const allowed = [
      'pid', 'suppliedOtp', 'lastOtpError', 'resendOtpRequested',
      'status', 'outcomeMessage', 'correctionMessage', 'correctionField',
      'correctionOptions', 'registrationPayload',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Bot sends recoveredPassword as plain text → encrypt before storing
    if (req.body.recoveredPassword) {
      updates.encryptedPassword = encrypt(req.body.recoveredPassword);
      console.log(`[Jobs] Password encrypted and stored for job ${jobId}`);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const job = await Job.findByIdAndUpdate(
      jobId,
      { $set: updates },
      { new: true, upsert: true }
    );
    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[Jobs] Error patching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
