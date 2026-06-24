'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import Button from '../ui/Button';

export default function RestartJobControl({ jobId }) {
  const [restarting, setRestarting] = useState(false);
  const router = useRouter();

  const handleRestart = async () => {
    if (!confirm('Are you sure you want to clone and restart this job? A new job will be created using the same data.')) return;
    
    setRestarting(true);
    try {
      let reqBody = null;
      let res = await apiFetch(`/jobs/${jobId}/clone`, { method: 'POST' });
      let data = await res.json();
      
      if (!res.ok && data.error === 'PAN_REQUIRED') {
        const missingPan = window.prompt('Because this job is old, the original PAN is missing. Please type the full PAN to restart:');
        if (!missingPan) {
          setRestarting(false);
          return;
        }
        res = await apiFetch(`/jobs/${jobId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pan: missingPan.toUpperCase() })
        });
        data = await res.json();
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to restart job');
      }
      
      // Navigate to the newly cloned job
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      alert(err.message);
      setRestarting(false);
    }
  };

  return (
    <Button 
      onClick={handleRestart} 
      loading={restarting} 
      className="bg-indigo-600 hover:bg-indigo-500 py-1.5 px-3 text-sm"
    >
      🔄 Restart Job
    </Button>
  );
}
