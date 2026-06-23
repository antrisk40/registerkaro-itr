'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import JobStatusBadge from './JobStatusBadge';
import JobConsole from './JobConsole';
import OtpInputForm from './OtpInputForm';
import StopJobControl from './StopJobControl';
import RestartJobControl from './RestartJobControl';
import CorrectionForm from './CorrectionForm';
import RecoveredPasswordCard from './RecoveredPasswordCard';
import { formatJobDate } from '../../lib/jobs';
import { useJobStatus } from '../../hooks/useJobStatus';

const INPUT_PHASES = ['OTP_GATE', 'CAPTCHA_GATE'];

export default function JobDetailPanel({ job: initialJob }) {
  const [stopped, setStopped] = useState(false);
  const { status, logs, error, isTerminal, lastOtpError, correctionMessage, correctionField, correctionOptions, recoveredPassword } = useJobStatus(initialJob._id, initialJob.status, initialJob);

  const needsInput = INPUT_PHASES.includes(status) && !isTerminal && !stopped;
  const latestOtpPrompt = logs.filter((l) => INPUT_PHASES.includes(l.phase)).at(-1);
  const displayPassword = recoveredPassword || initialJob.recoveredPassword;

  return (
    <div className="space-y-6">
      {needsInput && (
        <Card className="p-5 border-orange-500/40 bg-orange-500/10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔐</span>
            <div>
              <h3 className="text-lg font-bold text-orange-300">
                {status === 'CAPTCHA_GATE' ? 'CAPTCHA Required' : 'OTP Required — Action Needed'}
              </h3>
              <p className="text-sm text-orange-200/70">
                The portal is waiting for {status === 'CAPTCHA_GATE' ? 'a CAPTCHA' : 'an OTP'}. Enter it below.
              </p>
            </div>
          </div>
          <OtpInputForm
            key={latestOtpPrompt?.seq ?? status}
            jobId={initialJob._id}
            status={status}
            logs={logs}
            lastOtpError={lastOtpError}
          />
        </Card>
      )}

      {status === 'CORRECTION_GATE' && !isTerminal && !stopped && (
        <Card className={`p-5 ${correctionField === 'aadhaarOtpChoice' ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-orange-500/40 bg-orange-500/10'}`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{correctionField === 'aadhaarOtpChoice' ? '🔑' : '⚠️'}</span>
            <div>
              <h3 className={`text-lg font-bold ${correctionField === 'aadhaarOtpChoice' ? 'text-indigo-300' : 'text-orange-300'}`}>
                {correctionField === 'aadhaarOtpChoice' ? 'Action Required — Account Recovery' : 'Correction Required'}
              </h3>
              <p className={`text-sm ${correctionField === 'aadhaarOtpChoice' ? 'text-indigo-200/80' : 'text-orange-200/80'}`}>
                {correctionMessage || (correctionField === 'aadhaarOtpChoice' ? 'Please select how to proceed with Aadhaar OTP.' : 'The portal rejected some registration details. Please correct them and resume.')}
              </p>
            </div>
          </div>
          {correctionField ? (
            <CorrectionForm
              key={correctionField}
              jobId={initialJob._id} 
              initialPayload={initialJob.registrationPayload}
              correctionMessage={correctionMessage}
              correctionField={correctionField}
              correctionOptions={correctionOptions}
            />
          ) : (
            <p className="text-sm text-slate-400 animate-pulse">Loading options from portal...</p>
          )}
        </Card>
      )}

      {displayPassword && (
        <RecoveredPasswordCard password={displayPassword} />
      )}

      <Card className="p-6">
        {!isTerminal && !stopped && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-70 animate-pulse" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500 font-mono mb-1">JOB ID</p>
            <p className="text-sm text-gray-300 font-mono break-all">{initialJob._id}</p>
            <p className="text-lg text-white font-semibold mt-2">PAN: {initialJob.maskedPan}</p>
            <p className="text-xs text-gray-500 mt-2" suppressHydrationWarning>Created {formatJobDate(initialJob.createdAt)}</p>
            <p className="text-xs text-gray-500" suppressHydrationWarning>Updated {formatJobDate(initialJob.updatedAt)}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <JobStatusBadge status={status} stopped={stopped} />
            {(!isTerminal && !stopped) ? (
              <StopJobControl jobId={initialJob._id} onStopped={() => setStopped(true)} />
            ) : (
              <RestartJobControl jobId={initialJob._id} />
            )}
          </div>
        </div>

        {initialJob.registrationPayload && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 p-4 bg-black/20 rounded-xl border border-white/5 text-xs">
            <div><span className="text-gray-500">Category</span><p className="text-gray-200">{initialJob.registrationPayload.category || '—'}</p></div>
            <div><span className="text-gray-500">Type</span><p className="text-gray-200">{initialJob.registrationPayload.isOthers ? 'Others' : 'Taxpayer'}</p></div>
            <div><span className="text-gray-500">PID</span><p className="text-gray-200 font-mono">{initialJob.pid || '—'}</p></div>
          </div>
        )}

        <h3 className="text-sm font-semibold text-gray-300 mb-3">Live Console</h3>
        <JobConsole jobId={initialJob._id} logs={logs} error={error} stopped={stopped} />

        {initialJob.outcomeMessage && !displayPassword && (
          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
            {initialJob.outcomeMessage}
          </div>
        )}
      </Card>
    </div>
  );
}
