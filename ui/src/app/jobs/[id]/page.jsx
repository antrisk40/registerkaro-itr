'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchJob } from '../../../lib/api';
import PageHeader from '../../../components/ui/PageHeader';
import JobDetailPanel from '../../../components/jobs/JobDetailPanel';

export default function JobDetailPageClient() {
  const params = useParams();
  const jobId = params.id;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId).then((data) => {
      if (!data) setNotFound(true);
      else setJob(data);
      setLoading(false);
    });
  }, [jobId]);

  if (loading) return <p className="text-gray-400">Loading job...</p>;
  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="text-red-400">Job not found or access denied.</p>
        <Link href="/jobs" className="text-indigo-400 hover:underline">← Back to Jobs</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={`Job: ${job.maskedPan}`}
        description="Monitor live console output and interact with this bot instance."
        action={
          <Link
            href="/jobs"
            className="font-semibold py-2.5 px-4 rounded-xl transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
          >
            ← Back to Jobs
          </Link>
        }
      />
      <JobDetailPanel job={job} />
    </>
  );
}
