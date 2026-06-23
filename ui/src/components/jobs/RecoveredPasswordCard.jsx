'use client';

import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

export default function RecoveredPasswordCard({ password }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  if (!password) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Card className="p-5 border-green-500/40 bg-green-500/10">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl">🔑</span>
        <div>
          <h3 className="text-lg font-bold text-green-300">Password Recovered</h3>
          <p className="text-sm text-green-200/70">
            New portal password generated and saved securely. Copy it now — it won&apos;t appear in the live console.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <code className="flex-1 bg-black/40 border border-green-500/20 rounded-lg px-4 py-3 font-mono text-sm text-green-200 tracking-wide break-all">
          {visible ? password : '••••••••••••••'}
        </code>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setVisible((v) => !v)} className="flex-1 sm:flex-none">
            {visible ? 'Hide' : 'Show'}
          </Button>
          <Button onClick={handleCopy} className="flex-1 sm:flex-none">
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
