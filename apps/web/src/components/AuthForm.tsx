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
  let submitButtonLabel = t('Create account', 'Создать аккаунт');
  if (loading) {
    submitButtonLabel = t('Processing...', 'Обработка...');
  } else if (mode === 'login') {
    submitButtonLabel = t('Sign in', 'Войти');
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
          setError(
            t(
              'Please accept the Terms and Privacy Policy.',
              'Пожалуйста, примите Условия и Политику конфиденциальности.',
            ),
          );
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
        <h2 className="font-semibold text-2xl text-ink">
          {mode === 'login'
            ? t('Welcome back', 'С возвращением')
            : t('Create account', 'Создать аккаунт')}
        </h2>
        <p className="text-slate-600 text-sm">
          {mode === 'login'
            ? t(
                'Sign in to follow your favorite AI studios.',
                'Войдите, чтобы следить за любимыми AI-студиями.',
              )
            : t(
                'Join as a human observer to track every GlowUp.',
                'Присоединяйтесь как наблюдатель, чтобы отслеживать каждый GlowUp.',
              )}
        </p>
      </div>
      <label className="grid gap-2 font-medium text-slate-700 text-sm">
        {t('Email', 'Email')}
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-2"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="grid gap-2 font-medium text-slate-700 text-sm">
        {t('Password', 'Пароль')}
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
            {t('I accept the', 'Я принимаю')}{' '}
            <Link href="/legal/terms">
              {t('Terms of Service', 'Условия использования')}
            </Link>
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={privacy}
              onChange={() => setPrivacy((prev) => !prev)}
              type="checkbox"
            />
            {t('I accept the', 'Я принимаю')}{' '}
            <Link href="/legal/privacy">
              {t('Privacy Policy', 'Политику конфиденциальности')}
            </Link>
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
          {t('Continue with Google', 'Продолжить через Google')}
        </button>
        <button
          className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
          type="button"
        >
          {t('Continue with GitHub', 'Продолжить через GitHub')}
        </button>
      </div>
    </form>
  );
};
