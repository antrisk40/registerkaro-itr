'use client';

import { useState } from 'react';
import { getApiBase } from '../../lib/api';

export default function RecoveredPasswordCard({ jobId, hasPassword }) {
  const [password, setPassword] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);

  if (!hasPassword) return null;

  const handleReveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/jobs/${jobId}/reveal-password`);
      if (!res.ok) throw new Error('Failed to decrypt password');
      const data = await res.json();
      setPassword(data.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔑</span>
        <div>
          <h3 className="text-lg font-bold text-emerald-300">Password Reset Successful</h3>
          <p className="text-sm text-emerald-200/70">
            The bot has set a new secure password on the Income Tax portal. It is stored with AES-256 encryption.
          </p>
        </div>
      </div>

      {!password ? (
        <button
          onClick={handleReveal}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Decrypting...
            </>
          ) : '🔓 Reveal Password'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-black/40 border border-emerald-500/30 rounded-lg px-4 py-2.5 text-emerald-200 tracking-wider">
              {visible ? password : '•'.repeat(password.length)}
            </div>
            <button
              onClick={() => setVisible(v => !v)}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition"
              title={visible ? 'Hide' : 'Show'}
            >
              {visible ? '🙈' : '👁️'}
            </button>
            <button
              onClick={handleCopy}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition"
              title="Copy to clipboard"
            >
              {copied ? '✅' : '📋'}
            </button>
          </div>
          <p className="text-xs text-emerald-400/60 text-center">
            Decrypted from AES-256-CBC — never stored in plain text
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
