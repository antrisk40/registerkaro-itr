import JobCard from '../components/JobCard';
import NewJobForm from '../components/NewJobForm';


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
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 mb-4 tracking-tight">
          RegisterKaro Automation Engine
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
          Live monitoring of headless Playwright bot instances.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-1">
          <NewJobForm />
        </div>

        {/* Right Column: Live Jobs */}
        <div className="lg:col-span-2 space-y-6">
          {jobs.length === 0 ? (
            <div className="text-center p-12 bg-white/5 rounded-xl border border-white/10 backdrop-blur-xl">
              <p className="text-gray-400">No active jobs found. Launch a bot from the panel.</p>
            </div>
          ) : (
            jobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))
          )}
        </div>
        
      </div>
    </main>
  );
}
