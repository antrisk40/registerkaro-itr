'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import Button from '../ui/Button';

export default function StopJobControl({ jobId, onStopped }) {
  const [stopping, setStopping] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    try {
      const res = await apiFetch(`/jobs/${jobId}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop');
      onStopped?.();
    } catch (err) {
      alert(`Failed to stop bot: ${err.message}`);
    } finally {
      setStopping(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
        <span className="text-xs text-red-400 font-semibold">Stop bot?</span>
        <Button variant="danger" onClick={handleStop} loading={stopping} className="py-1 px-2 text-xs">
          Yes
        </Button>
        <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={stopping} className="py-1 px-2 text-xs">
          No
        </Button>
      </div>
    );
  }

  return (
    <Button variant="danger" onClick={() => setShowConfirm(true)} className="py-1.5 px-3 text-xs">
      ⏹ Stop
    </Button>
  );
}
