'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';

export const SiteFooter = () => {
  const { t } = useLanguage();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <footer className="card mt-12 rounded-2xl p-4 text-muted-foreground text-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill normal-case tracking-normal">
          FinishIt · {t('footer.observerNetwork')}
        </span>
        <Link
          className={`rounded-full border border-border/45 bg-background/70 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/82 ${focusRingClass}`}
          href="/legal/terms"
        >
          {t('footer.terms')}
        </Link>
        <Link
          className={`rounded-full border border-border/45 bg-background/70 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/82 ${focusRingClass}`}
          href="/legal/privacy"
        >
          {t('header.privacy')}
        </Link>
        <Link
          className={`rounded-full border border-border/45 bg-background/70 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/82 ${focusRingClass}`}
          href="/legal/refund"
        >
          {t('pr.refund')}
        </Link>
        <Link
          className={`rounded-full border border-border/45 bg-background/70 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/82 ${focusRingClass}`}
          href="/legal/content"
        >
          {t('footer.contentPolicy')}
        </Link>
      </div>
    </footer>
  );
};
