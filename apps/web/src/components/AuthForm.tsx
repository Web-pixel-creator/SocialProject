'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getApiErrorMessage } from '../lib/errors';

interface AuthFormProps {
  mode: 'login' | 'register';
  onSuccess?: () => void;
}

interface AuthSubmitPayload {
  email: string;
  password: string;
  privacy: boolean;
  terms: boolean;
}

export const AuthForm = ({ mode, onSuccess }: AuthFormProps) => {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const consentCheckboxClass =
    'h-4 w-4 rounded-md border border-border/25 bg-background/70 text-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const { isMutating: loading, trigger: triggerSubmit } = useSWRMutation<
    void,
    unknown,
    string,
    AuthSubmitPayload
  >('auth:submit', async (_key, { arg }) => {
    if (mode === 'login') {
      await login(arg.email, arg.password);
      return;
    }
    await register(arg.email, arg.password, {
      privacy: arg.privacy,
      terms: arg.terms,
    });
  });
  let submitButtonLabel = t('auth.createAccount');
  if (loading) {
    submitButtonLabel = t('common.processing');
  } else if (mode === 'login') {
    submitButtonLabel = t('header.signIn');
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'register' && !(terms && privacy)) {
      setError(t('auth.acceptTermsError'));
      return;
    }
    try {
      await triggerSubmit(
        {
          email,
          password,
          privacy,
          terms,
        },
        { throwOnError: true },
      );
      onSuccess?.();
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <form
      className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4 md:p-5"
      onSubmit={handleSubmit}
    >
      <div>
        <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
          {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {mode === 'login'
            ? t('auth.signInSubtitle')
            : t('auth.registerSubtitle')}
        </p>
      </div>
      <label className="grid gap-2 font-medium text-foreground text-sm">
        {t('common.email')}
        <input
          className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="grid gap-2 font-medium text-foreground text-sm">
        {t('common.password')}
        <input
          className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {mode === 'register' && (
        <div className="grid gap-2 text-muted-foreground text-sm">
          <label className="flex items-center gap-2 rounded-xl border border-border/25 bg-background/60 px-3 py-1.5 sm:py-2">
            <input
              checked={terms}
              className={consentCheckboxClass}
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
          <label className="flex items-center gap-2 rounded-xl border border-border/25 bg-background/60 px-3 py-1.5 sm:py-2">
            <input
              checked={privacy}
              className={consentCheckboxClass}
              onChange={() => setPrivacy((prev) => !prev)}
              type="checkbox"
            />
            {t('auth.iAcceptThe')}{' '}
            <Link
              className="text-primary underline-offset-2 hover:underline"
              href="/legal/privacy"
            >
              {t('auth.privacyPolicy')}
            </Link>
          </label>
        </div>
      )}
      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/10 p-2 text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <button
        className={`rounded-full border border-primary/35 bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-sm transition hover:border-primary/45 hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
        disabled={loading}
        type="submit"
      >
        {submitButtonLabel}
      </button>
      <div className="grid gap-2 text-muted-foreground text-xs">
        <button
          className={`rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
          type="button"
        >
          {t('auth.continueWithGoogle')}
        </button>
        <button
          className={`rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
          type="button"
        >
          {t('auth.continueWithGithub')}
        </button>
      </div>
    </form>
  );
};
