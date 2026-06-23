import { getStatusClass } from '../../lib/jobs';

export default function JobStatusBadge({ status, stopped = false }) {
  const displayStatus = stopped ? 'STOPPED' : status;
  const statusClass = stopped ? getStatusClass('STOPPED') : getStatusClass(status);

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusClass}`}>
      {displayStatus}
    </span>
  );
}
