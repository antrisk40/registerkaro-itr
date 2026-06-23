import { useState, useEffect, useMemo } from 'react';
import { getApiBase } from '../lib/api';
import { TERMINAL_STATUSES } from '../lib/jobs';
import { useSSEStream } from './useSSEStream';

const VALID_PHASES = new Set([
  'INIT', 'REGISTERING', 'BASIC_DETAILS', 'CONTACT_DETAILS',
  'OTP_GATE', 'CAPTCHA_GATE', 'ACCOUNT_RECOVERY',
  'ALREADY_EXISTS', 'SUCCESS', 'FAILED',
]);

export function useJobStatus(jobId, initialStatus) {
  const { logs, error } = useSSEStream(jobId);
  const [polledStatus, setPolledStatus] = useState(initialStatus);
  const [lastOtpError, setLastOtpError] = useState(null);

  const phaseFromLogs = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (VALID_PHASES.has(logs[i].phase)) return logs[i].phase;
    }
    return null;
  }, [logs]);

  const status = phaseFromLogs || polledStatus || initialStatus;
  const isTerminal = TERMINAL_STATUSES.includes(status);

  useEffect(() => {
    setPolledStatus(initialStatus);
  }, [initialStatus, jobId]);

  useEffect(() => {
    if (!jobId || isTerminal) return;

    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.job?.status) setPolledStatus(data.job.status);
        if (data.job?.lastOtpError !== undefined) {
          setLastOtpError(data.job.lastOtpError || null);
        }
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [jobId, isTerminal]);

  return { status, logs, error, isTerminal, lastOtpError };
}
