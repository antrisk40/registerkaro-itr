import Job from '../models/jobSchema.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import {
  jobListFilterForUser,
  loadJobForUser,
  sanitizeJobForUser,
  isTerminalJob,
} from '../utils/jobAccess.js';

export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const access = await loadJobForUser(jobId, req.user, { isBot: req.isBot });
    if (access.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const safeJob = sanitizeJobForUser(access.job.toObject(), req.user);
    return res.status(200).json({ job: safeJob });
  } catch (error) {
    console.error('[Jobs] Error fetching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllJobs = async (req, res) => {
  try {
    const filter = req.isBot ? {} : jobListFilterForUser(req.user);
    const jobs = await Job.find(filter).sort({ updatedAt: -1 }).lean();
    const safeJobs = jobs.map((job) => sanitizeJobForUser(job, req.user));
    return res.status(200).json({ jobs: safeJobs });
  } catch (error) {
    console.error('[Jobs] Error fetching all jobs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const revealPassword = async (req, res) => {
  try {
    const { jobId } = req.params;
    const access = await loadJobForUser(jobId, req.user, { isBot: req.isBot });
    if (access.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    if (!req.isBot && req.user?.role === 'admin') {
      return res.status(403).json({ error: 'Admins are not permitted to view decrypted passwords' });
    }

    const job = access.job;
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

    const access = await loadJobForUser(jobId, req.user, { isBot: req.isBot });
    if (access.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const job = await Job.findByIdAndUpdate(
      jobId,
      { suppliedOtp: otp, lastOtpError: null, updatedAt: Date.now() },
      { returnDocument: 'after' }
    );
    return res.status(200).json({ success: true, job: sanitizeJobForUser(job.toObject(), req.user) });
  } catch (error) {
    console.error('[Jobs] Error submitting OTP:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestResendOtp = async (req, res) => {
  try {
    const { jobId } = req.params;
    const access = await loadJobForUser(jobId, req.user, { isBot: req.isBot });
    if (access.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const job = await Job.findByIdAndUpdate(
      jobId,
      { $set: { resendOtpRequested: true, suppliedOtp: null, lastOtpError: null, updatedAt: Date.now() } },
      { returnDocument: 'after' }
    );
    return res.status(200).json({ success: true, job: sanitizeJobForUser(job.toObject(), req.user) });
  } catch (error) {
    console.error('[Jobs] Error requesting OTP resend:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const BOT_PATCH_FIELDS = [
  'pid', 'suppliedOtp', 'lastOtpError', 'resendOtpRequested',
  'status', 'outcomeMessage', 'correctionMessage', 'correctionField',
  'correctionOptions', 'registrationPayload',
];

const USER_ACTIVE_PATCH_FIELDS = [
  'suppliedOtp', 'lastOtpError', 'resendOtpRequested',
  'correctionMessage', 'correctionField', 'correctionOptions', 'registrationPayload', 'status',
];

export const patchJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const access = await loadJobForUser(jobId, req.user, { isBot: req.isBot });
    if (access.error === 'not_found' && !req.isBot) return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const existingJob = access.job;
    const isAdmin = req.isBot || req.user?.role === 'admin';
    const isOwner = req.isBot || String(existingJob?.createdBy) === String(req.user?.id);
    const terminal = existingJob ? isTerminalJob(existingJob.status) : false;

    if (!req.isBot && !isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.isBot && !isAdmin && terminal) {
      return res.status(403).json({ error: 'Completed jobs can only be edited by an administrator' });
    }

    const allowed = req.isBot
      ? BOT_PATCH_FIELDS
      : isAdmin
        ? [...BOT_PATCH_FIELDS]
        : USER_ACTIVE_PATCH_FIELDS;

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (req.body.recoveredPassword) {
      if (!req.isBot && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      updates.encryptedPassword = encrypt(req.body.recoveredPassword);
      console.log(`[Jobs] Password encrypted and stored for job ${jobId}`);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const job = await Job.findByIdAndUpdate(
      jobId,
      { $set: updates },
      { returnDocument: 'after', upsert: req.isBot }
    );
    return res.status(200).json({ success: true, job: sanitizeJobForUser(job.toObject(), req.user) });
  } catch (error) {
    console.error('[Jobs] Error patching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const adminEditJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const access = await loadJobForUser(jobId, req.user);
    if (access.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const { registrationPayload, outcomeMessage } = req.body;
    const updates = {};
    if (registrationPayload !== undefined) updates.registrationPayload = registrationPayload;
    if (outcomeMessage !== undefined) updates.outcomeMessage = outcomeMessage;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const job = await Job.findByIdAndUpdate(jobId, { $set: updates }, { returnDocument: 'after' });
    return res.status(200).json({ success: true, job: sanitizeJobForUser(job.toObject(), req.user) });
  } catch (error) {
    console.error('[Jobs] Error editing job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
