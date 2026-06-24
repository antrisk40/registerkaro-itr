'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchJobs } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import JobListItem from '../../components/jobs/JobListItem';
import { useAuth } from '../../context/AuthContext';

export default function JobsPageClient() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    fetchJobs().then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, [authLoading]);

  if (authLoading || loading) {
    return <p className="text-gray-400">Loading jobs...</p>;
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All Jobs' : 'My Jobs'}
        description={`${jobs.length} automation job${jobs.length === 1 ? '' : 's'}${isAdmin ? ' in the system' : ' launched by you'}.`}
        action={
          <Link href="/launch">
            <Button>🚀 Launch Bot</Button>
          </Link>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Launch a bot to see it listed here."
          action={
            <Link href="/launch">
              <Button>🚀 Launch Bot</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobListItem key={job._id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}
