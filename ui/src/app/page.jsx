import JobCard from '../components/JobCard';

// Ensures Next.js doesn't statically cache this page
export const dynamic = 'force-dynamic';

async function getJobs() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
  try {
    // We use no-store to ensure the Server Component always fetches fresh data on load
    const res = await fetch(`${API_URL}/jobs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch (err) {
    console.error('Failed to fetch jobs from API', err);
    return [];
  }
}

export default async function AdminDashboard() {
  const jobs = await getJobs();

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 border-b border-slate-700 pb-4">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">RegisterKaro Dashboard</h1>
        <p className="text-slate-400">Live automation job monitoring and human-in-the-loop interventions.</p>
      </div>

      <div className="flex flex-col gap-8">
        {jobs.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center">
            <p className="text-slate-400 text-lg">No active jobs found in the database.</p>
            <p className="text-sm mt-2 text-slate-500">Run your automation script to create a new job!</p>
          </div>
        ) : (
          jobs.map(job => (
            <JobCard key={job._id} job={job} />
          ))
        )}
      </div>
    </main>
  );
}
