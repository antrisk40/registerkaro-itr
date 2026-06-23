'use client';
import { useState } from 'react';

const FIELD = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{label}</label>
    {children}
  </div>
);

const INPUT = (props) => (
  <input
    {...props}
    className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
  />
);

const SELECT = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={onChange}
    className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
  >
    {options.map(o => <option key={o} value={o} className="bg-gray-900">{o}</option>)}
  </select>
);

export default function NewJobForm() {
  const [pan,              setPan]              = useState('CTRPN1155M');
  const [isOthers,         setIsOthers]         = useState(false);
  const [category,         setCategory]         = useState('Individual');
  const [lastName,         setLastName]         = useState('');
  const [middleName,       setMiddleName]       = useState('');
  const [firstName,        setFirstName]        = useState('');
  const [dateOfBirth,      setDateOfBirth]      = useState('');
  const [gender,           setGender]           = useState('Male');
  const [residentialStatus,setResidentialStatus]= useState('Resident');
  const [email,            setEmail]            = useState('');
  const [mobile,           setMobile]           = useState('');
  const [loading,          setLoading]          = useState(false);
  const [showAdvanced,     setShowAdvanced]     = useState(false);

  const taxpayerCategories = ['Individual', 'HUF', 'Company', 'Trust', 'Local Authority', 'Artificial Juridical Person'];
  const othersCategories   = ['External Agency', 'Chartered Accountant', 'Tax Deductor & Collector'];

  const handleToggle = (val) => {
    setIsOthers(val);
    setCategory(val ? 'Chartered Accountant' : 'Individual');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      await fetch(`${API.replace('/api', '')}/api/jobs/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pan, isOthers, category,
          lastName, middleName, firstName,
          dateOfBirth, gender, residentialStatus,
          email, mobile,
        }),
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      alert('Failed to launch bot. Is the Express server running?');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
      <div className="absolute -top-24 -right-24 w-56 h-56 bg-indigo-500/15 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 mb-5">
        🤖 Launch Automation Bot
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">

        {/* PAN */}
        <FIELD label="Target PAN *">
          <INPUT
            type="text"
            value={pan}
            onChange={e => setPan(e.target.value.toUpperCase())}
            maxLength={10}
            required
            style={{ fontFamily: 'monospace', letterSpacing: '0.2em' }}
          />
        </FIELD>

        {/* Registration Type Toggle */}
        <FIELD label="Registration Type">
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
            <button type="button" onClick={() => handleToggle(false)}
              className={`flex-1 py-2 text-sm rounded-md transition-all duration-300 ${!isOthers ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>
              Taxpayer
            </button>
            <button type="button" onClick={() => handleToggle(true)}
              className={`flex-1 py-2 text-sm rounded-md transition-all duration-300 ${isOthers ? 'bg-indigo-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>
              Others
            </button>
          </div>
        </FIELD>

        {/* Category */}
        <FIELD label="Category">
          <SELECT
            value={category}
            onChange={e => setCategory(e.target.value)}
            options={isOthers ? othersCategories : taxpayerCategories}
          />
        </FIELD>

        {/* ── Registration Details (collapsible) ── */}
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="w-full flex justify-between items-center p-3 bg-white/5 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <span className="font-semibold">Registration Details</span>
            <span className={`transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showAdvanced && (
            <div className="p-4 flex flex-col gap-3 bg-black/20">
              <p className="text-xs text-yellow-400/80">
                ⚠️ Fill exactly as per your PAN card. Portal validates against PAN records.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <FIELD label="Last Name *">
                  <INPUT type="text" value={lastName} onChange={e => setLastName(e.target.value.toUpperCase())} required />
                </FIELD>
                <FIELD label="First Name">
                  <INPUT type="text" value={firstName} onChange={e => setFirstName(e.target.value.toUpperCase())} />
                </FIELD>
              </div>

              <FIELD label="Middle Name">
                <INPUT type="text" value={middleName} onChange={e => setMiddleName(e.target.value.toUpperCase())} />
              </FIELD>

              <FIELD label="Date of Birth * (DD/MM/YYYY)">
                <INPUT
                  type="text"
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                  placeholder="01/01/1990"
                  maxLength={10}
                />
              </FIELD>

              <FIELD label="Gender *">
                <div className="flex gap-3">
                  {['Male', 'Female', 'Transgender'].map(g => (
                    <label key={g} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300 hover:text-white">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={gender === g}
                        onChange={() => setGender(g)}
                        className="accent-indigo-500"
                      />
                      {g}
                    </label>
                  ))}
                </div>
              </FIELD>

              <FIELD label="Residential Status *">
                <div className="flex gap-4">
                  {['Resident', 'Non Resident'].map(s => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300 hover:text-white">
                      <input
                        type="radio"
                        name="residentialStatus"
                        value={s}
                        checked={residentialStatus === s}
                        onChange={() => setResidentialStatus(s)}
                        className="accent-indigo-500"
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </FIELD>

              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <FIELD label="Mobile *">
                    <INPUT type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit" maxLength={10} />
                  </FIELD>
                  <FIELD label="Email *">
                    <INPUT type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com" />
                  </FIELD>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_35px_rgba(79,70,229,0.55)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-sm"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : <>🚀 Launch Automation Engine</>}
        </button>

      </form>
    </div>
  );
}
