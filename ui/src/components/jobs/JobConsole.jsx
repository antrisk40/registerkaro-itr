'use client';

import { LOG_COLORS } from '../../lib/jobs';

export default function JobConsole({ jobId, logs = [], error, stopped = false }) {
  return (
    <div className="bg-black/60 rounded-xl p-4 h-72 lg:h-96 overflow-y-auto font-mono text-xs border border-white/5 space-y-1">
      {logs.length === 0 ? (
        <span className="text-gray-600">⏳ Waiting for bot events...</span>
      ) : (
        logs.map((log) => (
          <div key={log.seq} className="flex gap-2">
            <span className="text-gray-600 shrink-0">[{log.phase}]</span>
            <span className={LOG_COLORS[log.level] || 'text-gray-300'}>{log.message}</span>
          </div>
        ))
      )}
      {stopped && <div className="text-red-400 mt-2">⏹ Bot stopped by user.</div>}
      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  );
}
