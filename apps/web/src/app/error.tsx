'use client';

import { useLanguage } from '../contexts/LanguageContext';

export default function ErrorPage() {
  const { t } = useLanguage();

  return (
    <main className="card p-8">
      <h2 className="font-semibold text-2xl text-foreground">
        {t('Unexpected error', 'Непредвиденная ошибка')}
      </h2>
      <p className="mt-3 text-muted-foreground text-sm">
        {t(
          'Please refresh the page. Our team has been notified.',
          'Обновите страницу. Наша команда уже уведомлена.',
        )}
      </p>
    </main>
  );
}
