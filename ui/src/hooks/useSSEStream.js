import { useState, useEffect } from 'react';
import { getApiBase, getToken } from '../lib/api';

export function useSSEStream(jobId) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    // Use EventSource to connect to Express SSE endpoint
    const token = getToken();
    const url = `${getApiBase()}/stream/${jobId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const newLog = JSON.parse(event.data);
        setLogs((prev) => {
          // Avoid duplicates based on sequence (seq)
          if (prev.find((log) => log.seq === newLog.seq)) return prev;
          return [...prev, newLog].sort((a, b) => a.seq - b.seq);
        });
      } catch (err) {
        console.error('Error parsing SSE data', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error', err);
      setError('Connection lost. Reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  return { logs, error };
}
