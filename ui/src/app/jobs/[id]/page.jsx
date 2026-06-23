import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchJob } from '../../../lib/api';
import PageHeader from '../../../components/ui/PageHeader';
import JobDetailPanel from '../../../components/jobs/JobDetailPanel';

export const dynamic = 'force-dynamic';

export default async function JobDetailPage({ params }) {
  const job = await fetchJob(params.id);

  if (!job) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`Job: ${job.maskedPan}`}
        description={`Monitor live console output and interact with this bot instance.`}
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
