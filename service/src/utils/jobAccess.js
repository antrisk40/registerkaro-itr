import Job from '../models/jobSchema.js';

export const TERMINAL_JOB_STATUSES = ['SUCCESS', 'FAILED', 'ALREADY_EXISTS'];

export const isTerminalJob = (status) => TERMINAL_JOB_STATUSES.includes(status);

export const userOwnsJob = (user, job) =>
  user?.role === 'admin' || (job?.createdBy && String(job.createdBy) === String(user?.id));

export const jobListFilterForUser = (user) =>
  user?.role === 'admin' ? {} : { createdBy: user.id };

export const sanitizeJobForUser = (job, user) => {
  const { encryptedPassword, ...safeJob } = job;
  safeJob.hasPassword = (user?.role === 'admin' || (user && String(job.createdBy) === String(user.id))) && !!encryptedPassword;
  return safeJob;
};

export const loadJobForUser = async (jobId, user, { isBot = false } = {}) => {
  const job = await Job.findById(jobId);
  if (!job) return { error: 'not_found' };
  if (isBot || user?.role === 'admin') return { job };
  if (String(job.createdBy) === String(user?.id)) return { job };
  return { error: 'forbidden' };
};
