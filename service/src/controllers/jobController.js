import Job from '../models/jobSchema.js';

export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.status(200).json({ job });
  } catch (error) {
    console.error('[Jobs] Error fetching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllJobs = async (req, res) => {
  try {
    const jobs = await Job.find({}).sort({ updatedAt: -1 }).lean();
    return res.status(200).json({ jobs });
  } catch (error) {
    console.error('[Jobs] Error fetching all jobs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitOtp = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;
    
    if (!otp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    const job = await Job.findByIdAndUpdate(
      jobId,
      {
        suppliedOtp: otp,
        lastOtpError: null,
        updatedAt: Date.now(),
      },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

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
      {
        $set: {
          resendOtpRequested: true,
          suppliedOtp: null,
          lastOtpError: null,
          updatedAt: Date.now(),
        },
      },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[Jobs] Error requesting OTP resend:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/jobs/:jobId — generic field patcher used by the bot to store its PID,
 * clear OTP on retry, and sync OTP error/resend flags.
 */
export const patchJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const allowed = ['pid', 'suppliedOtp', 'lastOtpError', 'resendOtpRequested', 'status', 'outcomeMessage', 'recoveredPassword', 'correctionMessage', 'correctionField', 'correctionOptions', 'registrationPayload'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const job = await Job.findByIdAndUpdate(jobId, { $set: updates }, { new: true, upsert: true });
    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[Jobs] Error patching job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
