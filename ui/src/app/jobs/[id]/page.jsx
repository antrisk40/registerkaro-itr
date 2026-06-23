import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchJob } from '../../../lib/api';
import PageHeader from '../../../components/ui/PageHeader';
import Button from '../../../components/ui/Button';
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
          <Link href="/jobs">
            <Button variant="secondary">← Back to Jobs</Button>
          </Link>
        }
      />
      <JobDetailPanel job={job} />
    </>
  );
}
