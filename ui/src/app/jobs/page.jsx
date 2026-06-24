'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchJobs } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import JobListItem from '../../components/jobs/JobListItem';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';

export default function JobsPageClient() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const jobsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true;
    const mobile = job.registrationPayload?.mobile || '';
    return mobile.includes(searchQuery);
  });

  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage) || 1;
  const startIndex = (currentPage - 1) * jobsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, startIndex + jobsPerPage);

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
        <div className="space-y-6">
          <div className="max-w-md mb-6">
            <Input
              type="text"
              placeholder="🔍 Search jobs by phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {filteredJobs.length === 0 ? (
            <p className="text-gray-400 p-4 border border-white/10 rounded-xl bg-white/5 text-center">No jobs found matching your search.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentJobs.map((job) => (
                <JobListItem key={job._id} job={job} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-6">
              <p className="text-sm text-gray-400">
                Showing <span className="font-semibold text-white">{startIndex + 1}</span> to <span className="font-semibold text-white">{Math.min(startIndex + jobsPerPage, filteredJobs.length)}</span> of <span className="font-semibold text-white">{filteredJobs.length}</span> jobs
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
