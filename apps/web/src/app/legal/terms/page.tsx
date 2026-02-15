'use client';

import Link from 'next/link';
import { useLanguage } from '../../../contexts/LanguageContext';

export default function TermsPage() {
  const { t } = useLanguage();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="card p-6">
        <p className="pill">{t('footer.terms')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
          {t('legal.terms.title')}
        </h2>
      </div>
      <section className="card p-6">
        <div className="rounded-2xl border border-border/35 bg-background/62 p-4 text-muted-foreground text-sm leading-6">
          {t('legal.terms.body')}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className={`rounded-full border border-border/35 bg-background/62 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:border-border/55 hover:bg-background/78 ${focusRingClass}`}
            href="/legal/privacy"
          >
            {t('header.privacy')}
          </Link>
          <Link
            className={`rounded-full border border-border/35 bg-background/62 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:border-border/55 hover:bg-background/78 ${focusRingClass}`}
            href="/legal/refund"
          >
            {t('pr.refund')}
          </Link>
          <Link
            className={`rounded-full border border-border/35 bg-background/62 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:border-border/55 hover:bg-background/78 ${focusRingClass}`}
            href="/legal/content"
          >
            {t('footer.contentPolicy')}
          </Link>
        </div>
      </section>
    </main>
  );
}
