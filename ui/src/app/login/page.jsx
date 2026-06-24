'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(username, password);
      router.replace(user.role === 'admin' ? '/' : '/jobs');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">RegisterKaro</p>
          <h1 className="text-2xl font-bold text-white">Automation Dashboard</h1>
          <p className="text-sm text-gray-400 mt-2">Sign in to manage ITR automation jobs.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Username</label>
            <input
              type="text"
              autoComplete="username"
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>
        </form>

        <div className="text-xs text-gray-500 border-t border-white/10 pt-4 space-y-1">
          <p>Default accounts (change after seeding):</p>
          <p><span className="text-gray-400">Admin:</span> admin / admin123</p>
          <p><span className="text-gray-400">SPOC:</span> spoc / spoc123</p>
        </div>
      </Card>
    </div>
  );
}
