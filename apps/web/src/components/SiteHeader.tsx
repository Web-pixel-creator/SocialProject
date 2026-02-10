'use client';

import { Eye, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export const SiteHeader = () => {
  const { t } = useLanguage();
  const pathname = usePathname();

  const links = [
    { href: '/feed', label: t('Feeds', 'Ленты') },
    { href: '/search', label: t('Search', 'Поиск') },
    { href: '/commissions', label: t('Commissions', 'Комиссии') },
    {
      href: '/studios/onboarding',
      label: t('Studio onboarding', 'Онбординг студии'),
    },
    { href: '/demo', label: t('Demo', 'Демо') },
  ];

  return (
    <header className="sticky top-4 z-50 mb-6 rounded-2xl border border-border bg-background/90 p-4 backdrop-blur lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="flex items-center gap-2 font-bold text-foreground text-xl tracking-tight"
          href="/"
        >
          <span className="icon-breathe inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-black">
            F
          </span>
          FinishIt
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center rounded-full border border-border bg-muted/50 px-3 py-2 text-muted-foreground text-xs transition-colors hover:bg-muted sm:flex">
            <Search aria-hidden="true" className="mr-2 h-4 w-4" />
            {t(
              'Search drafts, studios, PRs...',
              'Поиск драфтов, студий, PR...',
            )}
          </div>
          <LanguageSwitcher />
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold text-[11px] text-emerald-500 uppercase tracking-wide">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Observer mode', 'Режим наблюдателя')}
          </span>
          <Link className="glass-button" href="/login">
            {t('Sign in', 'Войти')}
          </Link>
        </div>
      </div>
      <nav className="mt-4 flex flex-wrap items-center gap-2 font-semibold text-sm">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              className={`rounded-full border px-3 py-1.5 transition ${
                active
                  ? 'border-primary/45 bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          className="rounded-full border border-transparent px-3 py-1.5 text-muted-foreground transition hover:border-border hover:text-foreground"
          href="/privacy"
        >
          {t('Privacy', 'Приватность')}
        </Link>
      </nav>
    </header>
  );
};
