import Job from '../../../shared/jobSchema.js';

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
