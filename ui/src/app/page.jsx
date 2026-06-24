'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchJobs } from '../lib/api';
import { summarizeJobs } from '../lib/jobs';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import StatsOverview from '../components/dashboard/StatsOverview';
import RecentJobsList from '../components/dashboard/RecentJobsList';
import { useAuth } from '../context/AuthContext';

export default function DashboardPageClient() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    fetchJobs().then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, [authLoading, isAdmin]);

  if (authLoading || loading) {
    return <p className="text-gray-400">Loading dashboard...</p>;
  }

  const stats = summarizeJobs(jobs);
  const recentJobs = jobs.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of all automation bot instances and their current status."
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
