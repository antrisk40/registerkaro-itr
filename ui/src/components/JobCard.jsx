'use client';

import { useState } from 'react';
import { useSSEStream } from '../hooks/useSSEStream';

export default function JobCard({ job }) {
  const { logs, error } = useSSEStream(job._id);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${job._id}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp }),
      });
      if (!res.ok) throw new Error('Failed to submit OTP');
      setSuccessMsg('OTP Submitted Successfully!');
    } catch (err) {
      console.error(err);
      alert('Error submitting OTP');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-blue-400">Job: {job._id}</h2>
        <span className="px-3 py-1 bg-slate-700 rounded-full text-sm font-semibold">{job.status}</span>
      </div>
      <p className="text-slate-400 text-sm mb-4">PAN: {job.maskedPan}</p>

      {/* Live Console */}
      <div className="bg-black rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm mb-6 border border-slate-700">
        {logs.length === 0 ? <span className="text-slate-600">Waiting for live logs...</span> : null}
        {logs.map((log) => (
          <div key={log.seq} className="mb-2">
            <span className="text-slate-500">[{log.phase}]</span>{' '}
            <span className={log.level === 'error' ? 'text-red-400' : 'text-green-400'}>
              {log.message}
            </span>
          </div>
        ))}
        {error && <div className="text-red-500 mt-2">{error}</div>}
      </div>

      {/* OTP Input Form */}
      {(!job.suppliedOtp && !successMsg) ? (
        <form onSubmit={handleOtpSubmit} className="flex gap-4">
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter OTP from user..."
            className="flex-1 bg-slate-900 text-white border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Submit OTP'}
          </button>
        </form>
      ) : (
        <div className="text-green-400 font-semibold bg-slate-900 p-3 rounded-lg text-center border border-green-900">
          {successMsg || `OTP Submitted: ${job.suppliedOtp}`}
        </div>
      )}
    </div>
  );
}
