'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        const next = new URLSearchParams(window.location.search).get('next');
        // Only allow same-site relative paths
        window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
        return;
      }
      setError(data.error || 'Login failed');
    } catch {
      setError('Network error — is the server running?');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto rounded-xl bg-sky-500 grid place-items-center text-2xl text-white mb-3">✈</div>
            <h1 className="text-xl font-bold text-slate-800">Telegram Control Panel</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="u">Username</label>
              <input id="u" type="text" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="p">Password</label>
              <div className="relative">
                <input id="p" type={showPw ? 'text' : 'password'} className="input pr-14" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700" onClick={() => setShowPw((v) => !v)}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Self-hosted · your data stays on this server</p>
      </div>
    </div>
  );
}
