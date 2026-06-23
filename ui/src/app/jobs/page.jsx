import Link from 'next/link';
import { fetchJobs } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import JobListItem from '../../components/jobs/JobListItem';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const jobs = await fetchJobs();

  return (
    <>
      <PageHeader
        title="All Jobs"
        description={`${jobs.length} automation job${jobs.length === 1 ? '' : 's'} in the system.`}
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
