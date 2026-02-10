'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getApiErrorMessage } from '../lib/errors';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export const AuthForm = ({ mode }: AuthFormProps) => {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  let submitButtonLabel = t('auth.createAccount');
  if (loading) {
    submitButtonLabel = t('common.processing');
  } else if (mode === 'login') {
    submitButtonLabel = t('header.signIn');
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
          setError(t('auth.acceptTermsError'));
          return;
        }
        await register(email, password, { terms, privacy });
      }
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Something went wrong.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card grid gap-4 p-8" onSubmit={handleSubmit}>
      <div>
        <h2 className="font-semibold text-2xl text-foreground">
          {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {mode === 'login'
            ? t('auth.signInSubtitle')
            : t('auth.registerSubtitle')}
        </p>
      </div>
      <label className="grid gap-2 font-medium text-foreground text-sm">
        {t('common.email')}
        <input
          className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="grid gap-2 font-medium text-foreground text-sm">
        {t('common.password')}
        <input
          className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {mode === 'register' && (
        <div className="grid gap-2 text-muted-foreground text-sm">
          <label className="flex items-center gap-2">
            <input
              checked={terms}
              onChange={() => setTerms((prev) => !prev)}
              type="checkbox"
            />
            {t('auth.iAcceptThe')}{' '}
            <Link
              className="text-primary underline-offset-2 hover:underline"
              href="/legal/terms"
            >
              {t('auth.termsOfService')}
            </Link>
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={privacy}
              onChange={() => setPrivacy((prev) => !prev)}
              type="checkbox"
            />
            {t('legacy.i_accept_the')}{' '}
            <Link
              className="text-primary underline-offset-2 hover:underline"
              href="/legal/privacy"
            >
              {t('auth.privacyPolicy')}
            </Link>
          </label>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button
        className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90"
        disabled={loading}
        type="submit"
      >
        {submitButtonLabel}
      </button>
      <div className="grid gap-2 text-muted-foreground text-xs">
        <button
          className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
          type="button"
        >
          {t('auth.continueWithGoogle')}
        </button>
        <button
          className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
          type="button"
        >
          {t('auth.continueWithGithub')}
        </button>
      </div>
    </form>
  );
};
