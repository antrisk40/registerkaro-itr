'use client';

import { useState, useEffect } from 'react';
import { getApiBase } from '../../lib/api';
import Button from '../ui/Button';

export default function CorrectionForm({ jobId, initialPayload, correctionMessage, correctionField, correctionOptions, onSubmitted }) {
  const [submitting, setSubmitting] = useState(false);
  const [payload, setPayload] = useState(initialPayload || {});

  // Debug logging
  console.log('[CorrectionForm Debug]', { correctionField, correctionOptions, correctionMessage });

  // Detect if this is a simple choice gate (not a registration correction)
  const isChoiceGate = correctionField && correctionOptions && correctionOptions.length > 0;
  const isAccountRecoveryChoice = correctionField === 'aadhaarOtpChoice';

  // Reset payload when correctionField changes (e.g., from null to aadhaarOtpChoice)
  useEffect(() => {
    if (correctionField) {
      setPayload(p => ({ ...p }));
    }
  }, [correctionField]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const patchBody = {
        correctionMessage: null,
        correctionField: null,
        correctionOptions: null,
        registrationPayload: payload,
      };

      // For account recovery choices, don't reset status back to REGISTERING
      if (!isAccountRecoveryChoice) {
        patchBody.status = 'REGISTERING';
      }

      const res = await fetch(`${getApiBase()}/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) throw new Error('Failed to submit');
      if (onSubmitted) onSubmitted();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field, value) => {
    setPayload(p => ({ ...p, [field]: value }));
  };

  // ── Account Recovery OTP Choice UI ────────────────────────────────────────
  if (isAccountRecoveryChoice) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-slate-300 leading-relaxed">{correctionMessage}</p>
        <div className="flex flex-col gap-2">
          {correctionOptions.map(opt => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                payload[correctionField] === opt
                  ? 'border-indigo-500 bg-indigo-500/20 text-white'
                  : 'border-slate-600 bg-black/30 text-slate-300 hover:border-indigo-400'
              }`}
            >
              <input
                type="radio"
                name={correctionField}
                value={opt}
                checked={payload[correctionField] === opt}
                onChange={() => handleChange(correctionField, opt)}
                className="accent-indigo-500 w-4 h-4"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
        <Button
          type="submit"
          loading={submitting}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500"
          disabled={!payload[correctionField]}
        >
          Confirm &amp; Continue
        </Button>
      </form>
    );
  }

  // ── Generic Choice Gate UI (for non-account-recovery choice gates) ────────
  if (isChoiceGate) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="p-3 mb-2 bg-indigo-500/10 border border-indigo-500/30 rounded-md">
          <label className="text-sm font-semibold text-indigo-300 block mb-2 capitalize">
            Select {correctionField.replace(/([A-Z])/g, ' $1')}
          </label>
          <select
            className="w-full px-3 py-2 bg-black/60 border border-indigo-500/50 rounded-md text-white focus:outline-none focus:border-indigo-400"
            value={payload[correctionField] || ''}
            onChange={(e) => handleChange(correctionField, e.target.value)}
          >
            <option value="" disabled>Select an option...</option>
            {correctionOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={submitting} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500">
          Submit Selection &amp; Resume
        </Button>
      </form>
    );
  }

  // ── Standard Registration Correction UI ───────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orange-200">Date of Birth</label>
          <input
            type="date"
            className="w-full px-3 py-2 bg-black/40 border border-orange-500/30 rounded-md text-white focus:outline-none focus:border-orange-500"
            value={
              payload.dateOfBirth?.includes('/')
                ? payload.dateOfBirth.split('/').reverse().join('-')
                : payload.dateOfBirth || ''
            }
            onChange={(e) => {
              const ymd = e.target.value;
              const dmy = ymd ? ymd.split('-').reverse().join('/') : '';
              handleChange('dateOfBirth', dmy);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orange-200">Pincode</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-black/40 border border-orange-500/30 rounded-md text-white focus:outline-none focus:border-orange-500"
            value={payload.pincode || ''}
            onChange={(e) => handleChange('pincode', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orange-200">First Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-black/40 border border-orange-500/30 rounded-md text-white focus:outline-none focus:border-orange-500"
            value={payload.firstName || ''}
            onChange={(e) => handleChange('firstName', e.target.value.toUpperCase())}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orange-200">Last Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-black/40 border border-orange-500/30 rounded-md text-white focus:outline-none focus:border-orange-500"
            value={payload.lastName || ''}
            onChange={(e) => handleChange('lastName', e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <Button type="submit" loading={submitting} className="w-full py-2 bg-orange-600 hover:bg-orange-500">
        Submit Correction &amp; Resume
      </Button>
    </form>
  );
}
