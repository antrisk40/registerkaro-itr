'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '../../lib/api';
import Card from '../ui/Card';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

const TAXPAYER_CATEGORIES = ['Individual', 'HUF', 'Company', 'Trust', 'Local Authority', 'Artificial Juridical Person'];
const OTHERS_CATEGORIES = ['External Agency', 'Chartered Accountant', 'Tax Deductor & Collector'];

export default function LaunchJobForm() {
  const router = useRouter();
  const [pan, setPan] = useState('CTRPN1155M');
  const [isOthers, setIsOthers] = useState(false);
  const [category, setCategory] = useState('Individual');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('Male');
  const [residentialStatus, setResidentialStatus] = useState('Resident');
  const [email, setEmail] = useState('');
  const [emailBelongsTo, setEmailBelongsTo] = useState('Self');
  const [mobile, setMobile] = useState('');
  const [mobileBelongsTo, setMobileBelongsTo] = useState('Self');
  
  // Address details
  const [country, setCountry] = useState('India');
  const [flat, setFlat] = useState('');
  const [road, setRoad] = useState('');
  const [pincode, setPincode] = useState('');
  const [postOffice, setPostOffice] = useState('');
  const [area, setArea] = useState('');
  const [town, setTown] = useState('');
  const [state, setStateName] = useState('');

  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const BELONGS_TO_OPTIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Father', 'Mother', 'Other'];

  const handleToggle = (val) => {
    setIsOthers(val);
    setCategory(val ? 'Chartered Accountant' : 'Individual');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/jobs/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pan, isOthers, category,
          lastName, middleName, firstName,
          dateOfBirth: dateOfBirth ? dateOfBirth.split('-').reverse().join('/') : '',
          gender, residentialStatus,
          email, emailBelongsTo, mobile, mobileBelongsTo,
          country, flat, road, pincode, postOffice, area, town, state
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Launch failed (${res.status})`);

      if (data.jobId) {
        router.push(`/jobs/${data.jobId}`);
      } else {
        router.push('/jobs');
      }
    } catch (err) {
      alert(err.message || 'Failed to launch bot. Is the Express server running on port 4000?');
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 group" glow>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
        <Field label="Target PAN *">
          <Input
            type="text"
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            maxLength={10}
            required
            style={{ fontFamily: 'monospace', letterSpacing: '0.2em' }}
          />
        </Field>

        <Field label="Registration Type">
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
            <button
              type="button"
              onClick={() => handleToggle(false)}
              className={`flex-1 py-2 text-sm rounded-md transition-all duration-300 ${!isOthers ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              Taxpayer
            </button>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              className={`flex-1 py-2 text-sm rounded-md transition-all duration-300 ${isOthers ? 'bg-indigo-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              Others
            </button>
          </div>
        </Field>

        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={isOthers ? OTHERS_CATEGORIES : TAXPAYER_CATEGORIES}
          />
        </Field>

        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex justify-between items-center p-3 bg-white/5 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <span className="font-semibold">Registration Details</span>
            <span className={`transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showAdvanced && (
            <div className="p-4 flex flex-col gap-3 bg-black/20">
              <p className="text-xs text-yellow-400/80">
                Fill exactly as per your PAN card. Portal validates against PAN records.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Last Name *">
                  <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value.toUpperCase())} required />
                </Field>
                <Field label="First Name">
                  <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value.toUpperCase())} />
                </Field>
              </div>

              <Field label="Middle Name">
                <Input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value.toUpperCase())} />
              </Field>

              <Field label="Date of Birth *">
                <Input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </Field>

              <Field label="Gender *">
                <div className="flex flex-wrap gap-3">
                  {['Male', 'Female', 'Transgender'].map((g) => (
                    <label key={g} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300 hover:text-white">
                      <input type="radio" name="gender" value={g} checked={gender === g} onChange={() => setGender(g)} className="accent-indigo-500" />
                      {g}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Residential Status *">
                <div className="flex flex-wrap gap-4">
                  {['Resident', 'Non Resident'].map((s) => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300 hover:text-white">
                      <input type="radio" name="residentialStatus" value={s} checked={residentialStatus === s} onChange={() => setResidentialStatus(s)} className="accent-indigo-500" />
                      {s}
                    </label>
                  ))}
                </div>
              </Field>

              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Contact Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Field label="Mobile *">
                      <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit" maxLength={10} />
                    </Field>
                    <Select value={mobileBelongsTo} onChange={(e) => setMobileBelongsTo(e.target.value)} options={BELONGS_TO_OPTIONS} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Field label="Email *">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@email.com" />
                    </Field>
                    <Select value={emailBelongsTo} onChange={(e) => setEmailBelongsTo(e.target.value)} options={BELONGS_TO_OPTIONS} />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Postal Address</p>
                
                <Field label="Country *">
                  <Select value={country} onChange={(e) => setCountry(e.target.value)} options={['India', 'Others']} />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Flat/Door/Building *">
                    <Input type="text" value={flat} onChange={(e) => setFlat(e.target.value)} />
                  </Field>
                  <Field label="Road/Street/Block">
                    <Input type="text" value={road} onChange={(e) => setRoad(e.target.value)} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <Field label="Pincode *">
                    <Input type="text" value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} />
                  </Field>
                  <Field label="Post Office *">
                    <Input type="text" value={postOffice} onChange={(e) => setPostOffice(e.target.value)} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <Field label="Area/Locality *">
                    <Input type="text" value={area} onChange={(e) => setArea(e.target.value)} />
                  </Field>
                  <Field label="Town/City/District *">
                    <Input type="text" value={town} onChange={(e) => setTown(e.target.value)} />
                  </Field>
                </div>
                
                <Field label="State *" className="mt-2">
                  <Input type="text" value={state} onChange={(e) => setStateName(e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </div>

        <Button type="submit" loading={loading} className="mt-2 w-full py-3">
          🚀 Launch Automation Engine
        </Button>
      </form>
    </Card>
  );
}
