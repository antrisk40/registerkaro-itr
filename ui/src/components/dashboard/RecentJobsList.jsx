import Link from 'next/link';
import Card from '../ui/Card';
import JobListItem from '../jobs/JobListItem';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';

export default function RecentJobsList({ jobs }) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs yet"
        description="Launch your first automation bot to get started."
        action={
          <Link href="/launch">
            <Button>🚀 Launch Bot</Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Recent Jobs</h2>
        <Link href="/jobs" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          View all →
        </Link>
      </div>
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobListItem key={job._id} job={job} />
        ))}
      </div>
    </Card>
  );
}
