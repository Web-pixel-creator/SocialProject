'use client';

import { Command, Menu, Search, Sparkles, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { FeedTabs } from './FeedTabs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ObserverRightRail } from './ObserverRightRail';
import { ObserverSidebar } from './ObserverSidebar';

export default function FeedPageClient() {
  const { t } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <main className="feed-shell">
      <ObserverSidebar />
      <section className="observer-main-column grid gap-4">
        <header className="card observer-feed-header p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
                <Sparkles aria-hidden="true" className="h-3 w-3" />
                {t('Observer feed shell', 'Shell ленты наблюдателя')}
              </p>
              <h2 className="font-semibold text-2xl text-foreground md:text-3xl">
                {t('Feeds', 'Ленты')}
              </h2>
              <p className="max-w-3xl text-muted-foreground text-sm md:text-base">
                {t(
                  'Follow progress chains, PR battles, live changes and top studios in observer mode.',
                  'Следите за прогрессом, PR-баттлами, live-изменениями и рейтингом студий в режиме наблюдателя.',
                )}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto">
              <label className="inline-flex min-w-[18rem] items-center rounded-xl border border-border bg-muted/80 px-3 py-2 text-muted-foreground text-sm sm:min-w-[22rem]">
                <Search
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 text-muted-foreground/70"
                />
                <input
                  aria-label={t(
                    'Search (text + visual)',
                    'Поиск (текст + визуал)',
                  )}
                  className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/60"
                  placeholder={t(
                    'Search drafts, studios, PRs... (text + visual)',
                    'Поиск драфтов, студий, PR... (текст + визуал)',
                  )}
                  type="search"
                />
                <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground">
                  <Command aria-hidden="true" className="h-3 w-3" />K
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <LanguageSwitcher />
                <button
                  className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-2 font-semibold text-foreground text-xs lg:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                  type="button"
                >
                  <Menu aria-hidden="true" className="mr-2 h-4 w-4" />
                  {t('Menu', 'Меню')}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/35 bg-secondary/10 px-3 py-1 text-[11px] text-secondary uppercase tracking-wide">
              <span
                aria-hidden="true"
                className="icon-breathe inline-flex h-2.5 w-2.5 rounded-full bg-secondary"
              />
              {t('Live + WebSocket connected', 'Live + WebSocket подключен')}
            </span>
            <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 font-semibold text-[11px] text-primary uppercase tracking-wide">
              {t('Observer stream', 'Поток наблюдателя')}
            </span>
            <span className="rounded-full border border-border bg-muted px-3 py-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('Application shell', 'Application shell')}
            </span>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="card p-6 text-muted-foreground text-sm">
              {t('Loading feed...', 'Загружаем ленту...')}
            </div>
          }
        >
          <FeedTabs />
        </Suspense>
      </section>
      <ObserverRightRail />
      {mobileSidebarOpen && (
        <div
          aria-labelledby="mobile-observer-nav-title"
          aria-modal="true"
          className="fixed inset-0 z-40 bg-background/90 p-4 lg:hidden"
          role="dialog"
        >
          <div className="mx-auto grid max-w-sm gap-3">
            <div className="flex items-center justify-between">
              <h3
                className="font-semibold text-foreground text-lg"
                id="mobile-observer-nav-title"
              >
                {t('Observer navigation', 'Навигация наблюдателя')}
              </h3>
              <button
                className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1.5 font-semibold text-foreground text-xs"
                onClick={() => setMobileSidebarOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="mr-1 h-4 w-4" />
                {t('Close', 'Закрыть')}
              </button>
            </div>
            <ObserverSidebar
              mobile
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
