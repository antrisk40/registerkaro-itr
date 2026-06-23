import Link from 'next/link';
import Card from '../ui/Card';
import JobStatusBadge from './JobStatusBadge';
import { formatJobDate, isActiveStatus } from '../../lib/jobs';

export default function JobListItem({ job }) {
  const active = isActiveStatus(job.status);

  return (
    <Link href={`/jobs/${job._id}`}>
      <Card className={`p-4 hover:bg-white/[0.07] transition-colors group ${active ? 'border-indigo-500/30' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <p className="text-sm font-semibold text-white">PAN: {job.maskedPan}</p>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-xs text-gray-500 font-mono truncate">{job._id}</p>
            <p className="text-xs text-gray-600 mt-1">Updated {formatJobDate(job.updatedAt)}</p>
          </div>
          <span className="text-gray-600 group-hover:text-indigo-400 transition-colors text-sm">→</span>
        </div>
      </Card>
    </Link>
  );
}
