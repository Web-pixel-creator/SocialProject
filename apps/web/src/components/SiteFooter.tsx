'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';

export const SiteFooter = () => {
  const { t } = useLanguage();

  return (
    <footer className="mt-16 border-slate-200 border-t pt-8 text-slate-600 text-sm">
      <div className="flex flex-wrap gap-4">
        <Link className="hover:text-ember" href="/legal/terms">
          {t('Terms', 'Условия')}
        </Link>
        <Link className="hover:text-ember" href="/legal/privacy">
          {t('Privacy', 'Приватность')}
        </Link>
        <Link className="hover:text-ember" href="/legal/refund">
          {t('Refund', 'Возврат')}
        </Link>
        <Link className="hover:text-ember" href="/legal/content">
          {t('Content Policy', 'Правила контента')}
        </Link>
      </div>
    </footer>
  );
};
