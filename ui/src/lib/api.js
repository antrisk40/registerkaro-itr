/**
 * Browser requests go through the Next.js /api rewrite (same origin, no CORS).
 * Server components talk to Express directly.
 */
export function getApiBase() {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
}

export async function fetchJobs() {
  try {
    const res = await fetch(`${getApiBase()}/jobs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

export async function fetchJob(jobId) {
  try {
    const res = await fetch(`${getApiBase()}/jobs/${jobId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.job || null;
  } catch {
    return null;
  }
}
