'use client';

import { Menu, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { FeedTabs } from './FeedTabs';
import { ObserverRightRail } from './ObserverRightRail';
import { ObserverSidebar } from './ObserverSidebar';
import { PanelErrorBoundary } from './PanelErrorBoundary';

export default function FeedPageClient() {
  const { t } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previousMobileSidebarOpenRef = useRef(false);

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return undefined;
    }

    previousBodyOverflowRef.current = document.body.style.overflow;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileSidebar();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflowRef.current ?? '';
      previousBodyOverflowRef.current = null;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeMobileSidebar, mobileSidebarOpen]);

  useEffect(() => {
    const wasOpen = previousMobileSidebarOpenRef.current;
    if (mobileSidebarOpen && !wasOpen) {
      window.requestAnimationFrame(() => {
        mobileMenuCloseButtonRef.current?.focus();
      });
    }

    if (!mobileSidebarOpen && wasOpen) {
      window.requestAnimationFrame(() => {
        mobileMenuButtonRef.current?.focus();
      });
    }

    previousMobileSidebarOpenRef.current = mobileSidebarOpen;
  }, [mobileSidebarOpen]);

  return (
    <main className="feed-shell">
      <ObserverSidebar />
      <section className="observer-main-column grid gap-4">
        <header className="card observer-feed-header overflow-hidden p-3 sm:p-4 lg:p-5">
          <div className="grid gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/25 bg-background/60 px-3 py-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:py-2">
                <span>{t('feed.observerStream')}</span>
                <span aria-hidden="true">/</span>
                <span className="text-primary">{t('header.feeds')}</span>
              </p>
              <span className="tag-live inline-flex min-h-8 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] uppercase tracking-wide sm:min-h-9 sm:px-3 sm:py-2">
                <span
                  aria-hidden="true"
                  className="icon-breathe live-dot inline-flex h-2.5 w-2.5 rounded-full motion-reduce:animate-none"
                />
                {t('common.live')}
              </span>
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="grid max-w-3xl gap-1.5 sm:gap-2">
                <h2 className="font-semibold text-[24px] text-foreground leading-tight sm:text-[28px] md:text-3xl">
                  {t('header.feeds')}
                </h2>
                <p className="text-muted-foreground text-sm md:text-base">
                  {t('feed.observerDescription')}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:w-auto md:justify-items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="inline-flex min-h-8 items-center rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1.5 font-semibold text-[11px] text-primary uppercase tracking-wide sm:min-h-9 sm:px-3 sm:py-2 sm:text-xs">
                    {t('header.observerMode')}
                  </span>
                  <button
                    className="inline-flex min-h-8 items-center rounded-full border border-transparent bg-background/58 px-2.5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2 lg:hidden"
                    onClick={openMobileSidebar}
                    ref={mobileMenuButtonRef}
                    type="button"
                  >
                    <Menu aria-hidden="true" className="mr-2 h-4 w-4" />
                    {t('common.menu')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <PanelErrorBoundary
          description={t('error.refreshPage')}
          retryLabel={t('common.retry')}
          title={t('error.unexpected')}
        >
          <Suspense
            fallback={
              <div className="card p-3 text-muted-foreground text-sm sm:p-5">
                {t('feed.loading')}
              </div>
            }
          >
            <FeedTabs />
          </Suspense>
        </PanelErrorBoundary>
      </section>
      <div
        aria-hidden={false}
        className="observer-right-rail-shell"
        data-testid="feed-right-rail-shell"
      >
        <PanelErrorBoundary
          description={t('error.refreshPage')}
          retryLabel={t('common.retry')}
          title={t('error.unexpected')}
        >
          <ObserverRightRail />
        </PanelErrorBoundary>
      </div>
      {mobileSidebarOpen && (
        <div
          aria-labelledby="mobile-observer-nav-title"
          aria-modal="true"
          className="overlay-backdrop fixed inset-0 z-[70] p-4 lg:hidden"
          role="dialog"
        >
          <div className="mx-auto grid max-w-sm gap-3">
            <div className="flex items-center justify-between">
              <h3
                className="font-semibold text-foreground text-lg"
                id="mobile-observer-nav-title"
              >
                {t('sidebar.observerNavigation')}
              </h3>
              <button
                className="inline-flex min-h-8 items-center rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2"
                onClick={closeMobileSidebar}
                ref={mobileMenuCloseButtonRef}
                type="button"
              >
                <X aria-hidden="true" className="mr-1 h-4 w-4" />
                {t('common.close')}
              </button>
            </div>
            <ObserverSidebar mobile onNavigate={closeMobileSidebar} />
          </div>
        </div>
      )}
    </main>
  );
}
