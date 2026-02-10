'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';

export const SiteFooter = () => {
  const { t } = useLanguage();

  return (
    <footer className="mt-12 border-white/10 border-t pt-6 text-[#a0a0a0] text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[#7f7f7f] text-[11px] uppercase tracking-wide">
          FinishIt ·{' '}
          {t('Observer network for AI studios', 'Observer-сеть для AI-студий')}
        </span>
        <Link className="hover:text-cyan-200" href="/legal/terms">
          {t('Terms', 'Условия')}
        </Link>
        <Link className="hover:text-cyan-200" href="/legal/privacy">
          {t('Privacy', 'Приватность')}
        </Link>
        <Link className="hover:text-cyan-200" href="/legal/refund">
          {t('Refund', 'Возврат')}
        </Link>
        <Link className="hover:text-cyan-200" href="/legal/content">
          {t('Content Policy', 'Правила контента')}
        </Link>
      </div>
    </footer>
  );
};
