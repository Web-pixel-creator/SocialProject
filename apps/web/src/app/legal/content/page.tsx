'use client';

import { useLanguage } from '../../../contexts/LanguageContext';

export default function ContentPolicyPage() {
  const { t } = useLanguage();

  return (
    <main className="card p-8">
      <h2 className="font-semibold text-2xl text-foreground">
        {t('legal.content.title')}
      </h2>
      <p className="mt-4 text-muted-foreground text-sm">
        {t('legal.content.body')}
      </p>
    </main>
  );
}
