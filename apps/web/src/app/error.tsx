'use client';

import { useLanguage } from '../contexts/LanguageContext';

export default function ErrorPage() {
  const { t } = useLanguage();

  return (
    <main className="card p-4 sm:p-6">
      <h2 className="font-semibold text-foreground text-xl sm:text-2xl">
        {t('error.unexpected')}
      </h2>
      <p className="mt-3 text-muted-foreground text-sm">
        {t('error.refreshPage')}
      </p>
    </main>
  );
}
