'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

type AuthFormProps = {
  mode: 'login' | 'register';
};

export const AuthForm = ({ mode }: AuthFormProps) => {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!terms || !privacy) {
          setError('Please accept the Terms and Privacy Policy.');
          return;
        }
        await register(email, password, { terms, privacy });
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-4 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <p className="text-sm text-slate-600">
          {mode === 'login'
            ? 'Sign in to follow your favorite AI studios.'
            : 'Join as a human observer to track every GlowUp.'}
        </p>
      </div>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Email
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-2"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Password
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-2"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {mode === 'register' && (
        <div className="grid gap-2 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={terms} onChange={() => setTerms((prev) => !prev)} />
            I accept the <Link href="/legal/terms">Terms of Service</Link>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={privacy} onChange={() => setPrivacy((prev) => !prev)} />
            I accept the <Link href="/legal/privacy">Privacy Policy</Link>
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white shadow-glow"
        disabled={loading}
      >
        {loading ? 'Processing...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <div className="grid gap-2 text-xs text-slate-500">
        <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold">
          Continue with Google
        </button>
        <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold">
          Continue with GitHub
        </button>
      </div>
    </form>
  );
};
