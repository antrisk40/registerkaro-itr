import { useState, useEffect, useMemo } from 'react';
import { getApiBase } from '../lib/api';
import { TERMINAL_STATUSES } from '../lib/jobs';
import { useSSEStream } from './useSSEStream';

const VALID_PHASES = new Set([
  'INIT', 'REGISTERING', 'BASIC_DETAILS', 'CONTACT_DETAILS',
  'OTP_GATE', 'CAPTCHA_GATE', 'CORRECTION_GATE', 'ACCOUNT_RECOVERY',
  'ALREADY_EXISTS', 'SUCCESS', 'FAILED',
]);

export function useJobStatus(jobId, initialStatus, initialJob = {}) {
  const { logs, error } = useSSEStream(jobId);
  const [polledStatus, setPolledStatus] = useState(initialStatus);
  const [lastOtpError, setLastOtpError] = useState(initialJob.lastOtpError || null);
  const [correctionMessage, setCorrectionMessage] = useState(initialJob.correctionMessage || null);
  const [correctionField, setCorrectionField] = useState(initialJob.correctionField || null);
  const [correctionOptions, setCorrectionOptions] = useState(initialJob.correctionOptions || null);
  const [recoveredPassword, setRecoveredPassword] = useState(initialJob.recoveredPassword || null);

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
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.job?.status) setPolledStatus(data.job.status);
        if (data.job?.lastOtpError !== undefined) {
          setLastOtpError(data.job.lastOtpError || null);
        }
        if (data.job?.correctionMessage !== undefined) {
          setCorrectionMessage(data.job.correctionMessage || null);
        }
        if (data.job?.correctionField !== undefined) {
          setCorrectionField(data.job.correctionField || null);
        }
        if (data.job?.correctionOptions !== undefined) {
          setCorrectionOptions(data.job.correctionOptions || null);
        }
        if (data.job?.recoveredPassword) {
          setRecoveredPassword(data.job.recoveredPassword);
        }
      } catch { /* ignore */ }
    };

    poll();
    const intervalMs = isTerminal ? 5000 : 2000;
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [jobId, isTerminal]);

  return { status, logs, error, isTerminal, lastOtpError, correctionMessage, correctionField, correctionOptions, recoveredPassword };
}
