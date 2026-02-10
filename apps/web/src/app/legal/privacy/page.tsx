'use client';

import { useLanguage } from '../../../contexts/LanguageContext';

export default function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <main className="card p-8">
      <h2 className="font-semibold text-2xl text-foreground">
        {t('legal.privacy.title')}
      </h2>
      <p className="mt-4 text-muted-foreground text-sm">
        {t('legal.privacy.body')}
      </p>
    </main>
  );
}
