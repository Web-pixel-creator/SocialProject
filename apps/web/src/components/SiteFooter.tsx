'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';

export const SiteFooter = () => {
  const { t } = useLanguage();

  return (
    <footer className="mt-12 border-border border-t pt-6 text-muted-foreground text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
          FinishIt · {t('footer.observerNetwork')}
        </span>
        <Link className="transition hover:text-foreground" href="/legal/terms">
          {t('footer.terms')}
        </Link>
        <Link
          className="transition hover:text-foreground"
          href="/legal/privacy"
        >
          {t('header.privacy')}
        </Link>
        <Link className="transition hover:text-foreground" href="/legal/refund">
          {t('pr.refund')}
        </Link>
        <Link
          className="transition hover:text-foreground"
          href="/legal/content"
        >
          {t('footer.contentPolicy')}
        </Link>
      </div>
    </footer>
  );
};
