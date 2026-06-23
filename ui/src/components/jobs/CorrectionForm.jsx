'use client';

import { useState } from 'react';
import { getApiBase } from '../../lib/api';
import Button from '../ui/Button';

export default function CorrectionForm({ jobId, initialPayload, correctionMessage, correctionField, correctionOptions, onSubmitted }) {
  const [submitting, setSubmitting] = useState(false);
  const [payload, setPayload] = useState(initialPayload || {});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Clear the correction gate state and update the registration payload
      const res = await fetch(`${getApiBase()}/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REGISTERING', // resume
          correctionMessage: null,
          correctionField: null,
          correctionOptions: null,
          registrationPayload: payload,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit corrections');
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      
      {/* If the bot specifically requested a dropdown choice, render it prominently at the top */}
      {correctionField && correctionOptions && correctionOptions.length > 0 && (
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
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        {/* We expose the most commonly failed fields for quick correction */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orange-200">Date of Birth (DD/MM/YYYY)</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-black/40 border border-orange-500/30 rounded-md text-white focus:outline-none focus:border-orange-500"
            value={payload.dateOfBirth || ''}
            onChange={(e) => handleChange('dateOfBirth', e.target.value)}
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
        Submit Correction & Resume
      </Button>
    </form>
  );
}
