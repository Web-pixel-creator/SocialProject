'use client';

import Link from 'next/link';
import { useLanguage } from '../../../contexts/LanguageContext';

export default function TermsPage() {
  const { t } = useLanguage();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-3 sm:gap-4">
      <div className="card p-4 sm:p-5">
        <p className="pill">{t('footer.terms')}</p>
        <h1 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {t('legal.terms.title')}
        </h1>
      </div>
      <section className="card p-4 sm:p-5">
        <div className="rounded-2xl border border-border/25 bg-background/60 p-3 text-muted-foreground text-sm leading-6 sm:p-3.5">
          {t('legal.terms.body')}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-3.5">
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 ${focusRingClass}`}
            href="/legal/privacy"
          >
            {t('header.privacy')}
          </Link>
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 ${focusRingClass}`}
            href="/legal/refund"
          >
            {t('pr.refund')}
          </Link>
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 ${focusRingClass}`}
            href="/legal/content"
          >
            {t('footer.contentPolicy')}
          </Link>
        </div>
      </section>
    </main>
  );
}
