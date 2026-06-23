import Link from 'next/link';
import { fetchJobs } from '../lib/api';
import { summarizeJobs } from '../lib/jobs';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import StatsOverview from '../components/dashboard/StatsOverview';
import RecentJobsList from '../components/dashboard/RecentJobsList';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const jobs = await fetchJobs();
  const stats = summarizeJobs(jobs);
  const recentJobs = jobs.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your automation bot instances and their current status."
        action={
          <Link href="/launch">
            <Button>🚀 Launch New Bot</Button>
          </Link>
        }
      />

      <div className="space-y-8">
        <StatsOverview stats={stats} />
        <RecentJobsList jobs={recentJobs} />
      </div>
    </>
  );
}
