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
import AdminJobEditPanel from './AdminJobEditPanel';
import { formatJobDate, TERMINAL_STATUSES } from '../../lib/jobs';
import { useJobStatus } from '../../hooks/useJobStatus';
import { useAuth } from '../../context/AuthContext';

const INPUT_PHASES = ['OTP_GATE', 'CAPTCHA_GATE'];
const AADHAAR_OTP_OPTIONS = ['I already have an OTP', 'Generate OTP'];

const isAadhaarOtpCorrectionLog = (log) =>
  log?.phase === 'CORRECTION_GATE' &&
  /Aadhaar OTP|generate a new OTP|use an existing one/i.test(log.message || '');

export default function JobDetailPanel({ job: initialJob }) {
  const [stopped, setStopped] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(initialJob.status === 'SUCCESS');
  const { isAdmin } = useAuth();
  const { status, logs, error, isTerminal, lastOtpError, correctionMessage, correctionField, correctionOptions, hasPassword } = useJobStatus(initialJob._id, initialJob.status, initialJob);

  useEffect(() => {
    if (status === 'SUCCESS') {
      setShowSuccessModal(true);
    }
  }, [status]);

  const needsInput = INPUT_PHASES.includes(status) && !isTerminal && !stopped;
  const latestOtpPrompt = logs.filter((l) => INPUT_PHASES.includes(l.phase)).at(-1);
  const latestCorrectionLog = logs.filter((l) => l.phase === 'CORRECTION_GATE').at(-1);
  const isAadhaarOtpGate =
    correctionField === 'aadhaarOtpChoice' ||
    (status === 'CORRECTION_GATE' && isAadhaarOtpCorrectionLog(latestCorrectionLog));
  const effectiveCorrectionField = isAadhaarOtpGate
    ? 'aadhaarOtpChoice'
    : (correctionField || 'registrationDetails');
  const effectiveCorrectionOptions = isAadhaarOtpGate
    ? ((correctionOptions?.length >= 2) ? correctionOptions : AADHAAR_OTP_OPTIONS)
    : correctionOptions;
  const effectiveCorrectionMessage = isAadhaarOtpGate
    ? (correctionMessage || latestCorrectionLog?.message || 'Aadhaar OTP required. Do you want to generate a new OTP or use an existing one?')
    : correctionMessage;
  const showAdminEdit = isAdmin && TERMINAL_STATUSES.includes(status);

  return (
    <div className="space-y-6">
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a1a]/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e2c] rounded-2xl shadow-2xl max-w-md w-full p-8 text-center relative border border-white/10">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-6 border border-green-500/30">
              <span className="text-3xl">🎉</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">ITR Credentials Created!</h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              The automation completed successfully. You can now log into the portal using the PAN and the generated password!
            </p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-brand-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              Awesome, thanks!
            </button>
          </div>
        </div>
      )}
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
        <Card className={`p-5 ${isAadhaarOtpGate ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-orange-500/40 bg-orange-500/10'}`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{isAadhaarOtpGate ? '🔑' : '⚠️'}</span>
            <div>
              <h3 className={`text-lg font-bold ${isAadhaarOtpGate ? 'text-indigo-300' : 'text-orange-300'}`}>
                {isAadhaarOtpGate ? 'Action Required — Account Recovery' : 'Correction Required'}
              </h3>
              <p className={`text-sm ${isAadhaarOtpGate ? 'text-indigo-200/80' : 'text-orange-200/80'}`}>
                {effectiveCorrectionMessage || (isAadhaarOtpGate ? 'Please select how to proceed with Aadhaar OTP.' : 'The portal rejected some registration details. Please correct them and resume.')}
              </p>
            </div>
          </div>
          <CorrectionForm
            key={effectiveCorrectionField}
            jobId={initialJob._id}
            initialPayload={initialJob.registrationPayload}
            correctionMessage={effectiveCorrectionMessage}
            correctionField={effectiveCorrectionField}
            correctionOptions={effectiveCorrectionOptions}
          />
        </Card>
      )}

      {(hasPassword || isAdmin) && (
        <RecoveredPasswordCard
          jobId={initialJob._id}
          hasPassword={hasPassword}
          isAdmin={isAdmin}
          userId={initialJob.originalPan || initialJob.maskedPan}
          generatedBy={initialJob.createdByName || '—'}
          generatedAt={initialJob.updatedAt}
        />
      )}

      {showAdminEdit && (
        <AdminJobEditPanel
          jobId={initialJob._id}
          registrationPayload={initialJob.registrationPayload}
          outcomeMessage={initialJob.outcomeMessage}
        />
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
            {initialJob.createdByName && (
              <p className="text-xs text-gray-500">Launched by {initialJob.createdByName}</p>
            )}
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

        {initialJob.outcomeMessage && !hasPassword && (
          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
            {initialJob.outcomeMessage}
          </div>
        )}
      </Card>
    </div>
  );
}
