'use client';

import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import Input from '../ui/Input';
import Button from '../ui/Button';

export default function OtpInputForm({ jobId, status, logs = [], lastOtpError = null, disabled = false }) {
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  const logError = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (!['OTP_GATE', 'CAPTCHA_GATE'].includes(log.phase)) continue;
      if (log.level === 'warn' || log.level === 'error') {
        if (/invalid|failed|not accepted|try again|resend/i.test(log.message)) {
          return log.message;
        }
      }
    }
    return '';
  }, [logs]);

  const displayError = lastOtpError || logError || localError;

  useEffect(() => {
    if (displayError) {
      setPending(false);
    }
  }, [displayError]);

  useEffect(() => {
    setLocalError('');
    setResendMsg('');
    setPending(false);
  }, [jobId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setSubmitting(true);
    setLocalError('');
    setResendMsg('');
    try {
      const res = await apiFetch(`/jobs/${jobId}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to submit OTP');
      setPending(true);
    } catch (err) {
      setLocalError(err.message || 'Failed to submit OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setLocalError('');
    setOtp('');
    setPending(false);
    try {
      const res = await apiFetch(`/jobs/${jobId}/resend-otp`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to request resend');
      setResendMsg('Resend requested — bot will click Resend on the portal. Enter the new OTP when it arrives.');
    } catch (err) {
      setLocalError(err.message || 'Failed to request OTP resend');
    } finally {
      setResending(false);
    }
  };

  const isCaptcha = status === 'CAPTCHA_GATE';

  return (
    <div className="space-y-3">
      {displayError && (
        <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          ❌ {displayError}
        </div>
      )}

      {pending && !displayError && (
        <div className="text-yellow-300 text-sm bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          ⏳ OTP submitted — bot is typing it on the portal and clicking Validate…
        </div>
      )}

      {resendMsg && (
        <div className="text-blue-300 text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          {resendMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
          placeholder={isCaptcha ? 'Enter CAPTCHA value...' : 'Enter OTP from mobile/email...'}
          maxLength={isCaptcha ? 10 : 8}
          className="flex-1 font-mono tracking-widest text-lg"
          required
          disabled={disabled || submitting}
        />
        <div className="flex gap-2 sm:flex-col sm:w-auto w-full">
          <Button type="submit" loading={submitting} disabled={disabled} className="flex-1 sm:w-36">
            Submit OTP
          </Button>
          {!isCaptcha && (
            <Button
              type="button"
              variant="secondary"
              loading={resending}
              disabled={disabled}
              onClick={handleResend}
              className="flex-1 sm:w-36"
            >
              Resend OTP
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
