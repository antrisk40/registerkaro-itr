import Link from 'next/link';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import JobStatusBadge from '../jobs/JobStatusBadge';
import { formatJobDate } from '../../lib/jobs';

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
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="pb-3 font-medium">Job ID</th>
                <th className="pb-3 font-medium">PAN (masked)</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Created At</th>
                <th className="pb-3 font-medium">Outcome</th>
                <th className="pb-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs.map((job) => (
                <tr key={job._id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-4 pr-4">
                    <p className="text-xs text-gray-400 font-mono truncate max-w-[120px]">{job._id}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-sm font-semibold text-gray-200">{job.maskedPan}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-xs text-gray-500" suppressHydrationWarning>{formatJobDate(job.createdAt)}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-xs text-gray-400 max-w-[200px] truncate" title={job.outcomeMessage || '—'}>
                      {job.outcomeMessage || '—'}
                    </p>
                  </td>
                  <td className="py-4 text-right">
                    <Link href={`/jobs/${job._id}`} className="text-sm text-brand-orange hover:text-orange-300 transition-colors opacity-80 hover:opacity-100">
                      View Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    </Card>
  );
}
