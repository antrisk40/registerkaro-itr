/**
 * Browser requests go through the Next.js /api rewrite (same origin, no CORS).
 * Server components talk to Express directly.
 */
export function getApiBase() {
  // Always use the full backend URL to bypass the noisy Next.js proxy
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
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
