import mongoose from 'mongoose';
import Job from '../../../shared/jobSchema.js';
import JobCard from '../components/JobCard';

// Ensures Next.js doesn't statically cache this page
export const dynamic = 'force-dynamic';

async function getJobs() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/registerkaro';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
  }
  
  // Fetch all jobs, latest first
  const jobs = await Job.find({}).sort({ updatedAt: -1 }).lean();
  
  // Mongoose lean() returns ObjectIds which must be stringified for Server Components passing props to Client Components
  return jobs.map(j => ({
    ...j,
    _id: j._id.toString(),
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));
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
