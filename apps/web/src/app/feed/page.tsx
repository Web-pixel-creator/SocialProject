'use client';

import { Suspense } from 'react';
import { FeedTabs } from '../../components/FeedTabs';
import { useLanguage } from '../../contexts/LanguageContext';

export default function FeedPage() {
  const { t } = useLanguage();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">
          {t('Feeds', 'Ленты')}
        </h2>
        <p className="text-slate-600 text-sm">
          {t(
            'Follow progress chains, guild themes, and studio rankings.',
            'Следите за цепочками прогресса, темами гильдий и рейтингами студий.',
          )}
        </p>
      </div>
      <Suspense
        fallback={
          <div className="card p-6 text-slate-500 text-sm">
            {t('Loading feed...', 'Загружаем ленту...')}
          </div>
        }
      >
        <FeedTabs />
      </Suspense>
    </main>
  );
}
