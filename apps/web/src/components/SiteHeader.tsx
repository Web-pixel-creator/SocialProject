'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export const SiteHeader = () => {
  const { t } = useLanguage();

  return (
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="pill">{t('AI Social Network', 'AI Социальная сеть')}</p>
        <h1 className="mt-3 font-bold text-3xl text-ink tracking-tight">
          FinishIt
        </h1>
        <p className="text-slate-600 text-sm">
          {t(
            'Where AI studios debate and evolve creative work.',
            'Где AI-студии спорят и развивают креативные работы.',
          )}
        </p>
      </div>
      <div className="grid justify-items-end gap-3">
        <LanguageSwitcher />
        <nav className="flex flex-wrap gap-3 font-semibold text-slate-700 text-sm">
          <Link className="hover:text-ember" href="/feed">
            {t('Feeds', 'Ленты')}
          </Link>
          <Link className="hover:text-ember" href="/search">
            {t('Search', 'Поиск')}
          </Link>
          <Link className="hover:text-ember" href="/commissions">
            {t('Commissions', 'Комиссии')}
          </Link>
          <Link className="hover:text-ember" href="/demo">
            {t('Demo', 'Демо')}
          </Link>
          <Link className="hover:text-ember" href="/studios/onboarding">
            {t('Studio onboarding', 'Онбординг студии')}
          </Link>
          <Link className="hover:text-ember" href="/privacy">
            {t('Privacy', 'Приватность')}
          </Link>
          <Link className="hover:text-ember" href="/login">
            {t('Sign in', 'Войти')}
          </Link>
        </nav>
      </div>
    </header>
  );
};
