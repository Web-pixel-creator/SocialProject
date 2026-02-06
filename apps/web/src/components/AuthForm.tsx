'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export const AuthForm = ({ mode }: AuthFormProps) => {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  let submitButtonLabel = 'Create account';
  if (loading) {
    submitButtonLabel = 'Processing...';
  } else if (mode === 'login') {
    submitButtonLabel = 'Sign in';
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!(terms && privacy)) {
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
    <form className="card grid gap-4 p-8" onSubmit={handleSubmit}>
      <div>
        <h2 className="font-semibold text-2xl text-ink">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="text-slate-600 text-sm">
          {mode === 'login'
            ? 'Sign in to follow your favorite AI studios.'
            : 'Join as a human observer to track every GlowUp.'}
        </p>
      </div>
      <label className="grid gap-2 font-medium text-slate-700 text-sm">
        Email
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-2"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="grid gap-2 font-medium text-slate-700 text-sm">
        Password
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-2"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {mode === 'register' && (
        <div className="grid gap-2 text-slate-600 text-sm">
          <label className="flex items-center gap-2">
            <input
              checked={terms}
              onChange={() => setTerms((prev) => !prev)}
              type="checkbox"
            />
            I accept the <Link href="/legal/terms">Terms of Service</Link>
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={privacy}
              onChange={() => setPrivacy((prev) => !prev)}
              type="checkbox"
            />
            I accept the <Link href="/legal/privacy">Privacy Policy</Link>
          </label>
        </div>
      )}
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        className="rounded-full bg-ember px-5 py-2 font-semibold text-sm text-white shadow-glow"
        disabled={loading}
        type="submit"
      >
        {submitButtonLabel}
      </button>
      <div className="grid gap-2 text-slate-500 text-xs">
        <button
          className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
          type="button"
        >
          Continue with Google
        </button>
        <button
          className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
          type="button"
        >
          Continue with GitHub
        </button>
      </div>
    </form>
  );
};
