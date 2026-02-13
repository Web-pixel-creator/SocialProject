'use client';

import { ChevronDown, Menu, SlidersHorizontal, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { FeedTabs } from './FeedTabs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ObserverRightRail } from './ObserverRightRail';
import { ObserverSidebar } from './ObserverSidebar';
import { PanelErrorBoundary } from './PanelErrorBoundary';

type FeedViewMode = 'observer' | 'focus';

const FEED_VIEW_MODE_STORAGE_KEY = 'finishit-feed-view-mode';
const FEED_VIEW_MODE_HINT_STORAGE_KEY = 'finishit-feed-view-hint-seen';
const DEFAULT_FEED_VIEW_MODE: FeedViewMode = 'observer';

const parseFeedViewMode = (value: string | null): FeedViewMode | null => {
  if (value === 'observer' || value === 'focus') {
    return value;
  }
  return null;
};

export default function FeedPageClient() {
  const { t } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<FeedViewMode>(
    DEFAULT_FEED_VIEW_MODE,
  );
  const [showViewModeHint, setShowViewModeHint] = useState(false);
  const previousBodyOverflowRef = useRef<string | null>(null);

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const persistViewMode = useCallback((nextMode: FeedViewMode) => {
    try {
      window.localStorage.setItem(FEED_VIEW_MODE_STORAGE_KEY, nextMode);
    } catch {
      // ignore localStorage write errors
    }
  }, []);

  useEffect(() => {
    try {
      const storedViewMode = parseFeedViewMode(
        window.localStorage.getItem(FEED_VIEW_MODE_STORAGE_KEY),
      );
      if (storedViewMode) {
        setViewMode(storedViewMode);
      }
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    try {
      const hintSeen =
        window.localStorage.getItem(FEED_VIEW_MODE_HINT_STORAGE_KEY) === '1';
      if (!hintSeen) {
        setShowViewModeHint(true);
      }
    } catch {
      setShowViewModeHint(true);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FEED_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // ignore localStorage write errors
    }
  }, [viewMode]);

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

  const setObserverMode = useCallback(() => {
    setViewMode('observer');
    persistViewMode('observer');
  }, [persistViewMode]);

  const setFocusMode = useCallback(() => {
    setViewMode('focus');
    persistViewMode('focus');
  }, [persistViewMode]);

  const markViewModeHintSeen = useCallback(() => {
    setShowViewModeHint(false);
    try {
      window.localStorage.setItem(FEED_VIEW_MODE_HINT_STORAGE_KEY, '1');
    } catch {
      // ignore localStorage write errors
    }
  }, []);

  const dismissViewModeHint = useCallback(() => {
    markViewModeHintSeen();
  }, [markViewModeHintSeen]);

  const applyViewModeFromHint = useCallback(
    (nextMode: FeedViewMode) => {
      setViewMode(nextMode);
      persistViewMode(nextMode);
      markViewModeHintSeen();
    },
    [markViewModeHintSeen, persistViewMode],
  );

  const isObserverMode = viewMode === 'observer';

  return (
    <main className={`feed-shell ${isObserverMode ? '' : 'feed-shell-focus'}`}>
      <ObserverSidebar />
      <section className="observer-main-column grid gap-4">
        <header className="card observer-feed-header p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-2xl text-foreground md:text-3xl">
                {t('header.feeds')}
              </h2>
              <p className="max-w-3xl text-muted-foreground text-sm md:text-base">
                {t('feed.observerDescription')}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
                  <button
                    aria-pressed={isObserverMode}
                    className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      isObserverMode
                        ? 'border border-primary/45 bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={setObserverMode}
                    type="button"
                  >
                    {t('header.observerMode')}
                  </button>
                  <button
                    aria-pressed={!isObserverMode}
                    className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      isObserverMode
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'border border-primary/45 bg-primary/10 text-primary'
                    }`}
                    onClick={setFocusMode}
                    type="button"
                  >
                    {t('header.focusMode')}
                  </button>
                </div>
                <div className="relative hidden lg:block">
                  <details className="settings-menu group relative">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-muted px-3 py-2 font-semibold text-foreground text-xs transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
                      <SlidersHorizontal
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                      {t('sidebar.item.settings')}
                      <ChevronDown
                        aria-hidden="true"
                        className="settings-menu-icon h-3.5 w-3.5"
                      />
                    </summary>
                    <div className="absolute right-0 z-30 mt-2 min-w-[15rem] rounded-2xl border border-border bg-card/95 p-3 backdrop-blur-sm">
                      <p className="mb-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t('lang.language')}
                      </p>
                      <LanguageSwitcher showLabel={false} />
                    </div>
                  </details>
                </div>
                <button
                  className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-2 font-semibold text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
                  onClick={openMobileSidebar}
                  type="button"
                >
                  <Menu aria-hidden="true" className="mr-2 h-4 w-4" />
                  {t('common.menu')}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="tag-live inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide">
              <span
                aria-hidden="true"
                className="icon-breathe live-dot inline-flex h-2.5 w-2.5 rounded-full motion-reduce:animate-none"
              />
              {t('common.live')}
            </span>
          </div>
          {showViewModeHint ? (
            <div className="mt-3 rounded-xl border border-border bg-muted/55 p-3">
              <p className="font-semibold text-foreground text-sm">
                {t('feed.viewModeHint.title')}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('feed.viewModeHint.description')}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className={`rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isObserverMode
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-border bg-background/70 text-foreground hover:border-primary/45 hover:text-primary'
                  }`}
                  onClick={() => applyViewModeFromHint('observer')}
                  type="button"
                >
                  {t('feed.viewModeHint.chooseObserver')}
                </button>
                <button
                  className={`rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isObserverMode
                      ? 'border-border bg-background/70 text-foreground hover:border-primary/45 hover:text-primary'
                      : 'border-primary/45 bg-primary/10 text-primary'
                  }`}
                  onClick={() => applyViewModeFromHint('focus')}
                  type="button"
                >
                  {t('feed.viewModeHint.chooseFocus')}
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  className="rounded-full border border-border bg-background/70 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={dismissViewModeHint}
                  type="button"
                >
                  {t('feed.viewModeHint.dismiss')}
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <PanelErrorBoundary
          description={t('error.refreshPage')}
          retryLabel={t('common.retry')}
          title={t('error.unexpected')}
        >
          <Suspense
            fallback={
              <div className="card p-6 text-muted-foreground text-sm">
                {t('feed.loading')}
              </div>
            }
          >
            <FeedTabs isObserverMode={isObserverMode} />
          </Suspense>
        </PanelErrorBoundary>
      </section>
      <div
        aria-hidden={!isObserverMode}
        className={`observer-right-rail-shell ${
          isObserverMode
            ? 'observer-right-rail-shell-open'
            : 'observer-right-rail-shell-collapsed'
        }`}
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
          className="fixed inset-0 z-[70] bg-background/90 p-4 lg:hidden"
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
                className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1.5 font-semibold text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={closeMobileSidebar}
                type="button"
              >
                <X aria-hidden="true" className="mr-1 h-4 w-4" />
                {t('common.close')}
              </button>
            </div>
            <div className="card p-3">
              <LanguageSwitcher />
            </div>
            <ObserverSidebar mobile onNavigate={closeMobileSidebar} />
          </div>
        </div>
      )}
    </main>
  );
}
