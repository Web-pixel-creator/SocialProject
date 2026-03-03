'use client';

import { Menu, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { CreatorStudiosRail } from './CreatorStudiosRail';
import { FeedTabs } from './FeedTabs';
import { LiveStudioSessionsRail } from './LiveStudioSessionsRail';
import { ObserverRightRail } from './ObserverRightRail';
import { ObserverSidebar } from './ObserverSidebar';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { SwarmSessionsRail } from './SwarmSessionsRail';

type RightRailView = 'live' | 'studio' | 'radar';
const RIGHT_RAIL_VIEW_STORAGE_KEY = 'finishit-feed-right-rail-view';
const RIGHT_RAIL_SWITCH_DELAY_MS = 180;
const RIGHT_RAIL_TAB_ORDER: RightRailView[] = ['live', 'studio', 'radar'];

const parseRightRailView = (value: string | null): RightRailView | null => {
  if (value === 'live' || value === 'studio' || value === 'radar') {
    return value;
  }
  return null;
};

export default function FeedPageClient() {
  const { t } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rightRailView, setRightRailView] = useState<RightRailView>('live');
  const [rightRailViewHydrated, setRightRailViewHydrated] = useState(false);
  const [isRightRailSwitching, setIsRightRailSwitching] = useState(false);
  const [liveTabCount, setLiveTabCount] = useState(2);
  const [swarmTabCount, setSwarmTabCount] = useState(2);
  const [creatorTabCount, setCreatorTabCount] = useState(2);
  const [radarTabCount, setRadarTabCount] = useState(4);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const rightRailTabRefs = useRef<
    Record<RightRailView, HTMLButtonElement | null>
  >({
    live: null,
    studio: null,
    radar: null,
  });
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previousMobileSidebarOpenRef = useRef(false);
  const studioTabCount = swarmTabCount + creatorTabCount;

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const switchRightRailView = useCallback(
    (nextView: RightRailView) => {
      if (nextView === rightRailView) {
        return;
      }
      setIsRightRailSwitching(true);
      setRightRailView(nextView);
    },
    [rightRailView],
  );

  const handleRightRailTabKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      currentView: RightRailView,
    ) => {
      const currentIndex = RIGHT_RAIL_TAB_ORDER.indexOf(currentView);
      if (currentIndex < 0) {
        return;
      }

      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % RIGHT_RAIL_TAB_ORDER.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex =
          (currentIndex - 1 + RIGHT_RAIL_TAB_ORDER.length) %
          RIGHT_RAIL_TAB_ORDER.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = RIGHT_RAIL_TAB_ORDER.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextView = RIGHT_RAIL_TAB_ORDER[nextIndex];
      if (nextView !== rightRailView) {
        switchRightRailView(nextView);
      }
      window.requestAnimationFrame(() => {
        rightRailTabRefs.current[nextView]?.focus();
      });
    },
    [rightRailView, switchRightRailView],
  );

  const handleLiveCountChange = useCallback((count: number) => {
    setLiveTabCount(Math.max(0, Math.round(count)));
  }, []);

  const handleSwarmCountChange = useCallback((count: number) => {
    setSwarmTabCount(Math.max(0, Math.round(count)));
  }, []);

  const handleCreatorCountChange = useCallback((count: number) => {
    setCreatorTabCount(Math.max(0, Math.round(count)));
  }, []);

  const handleRadarCountChange = useCallback((count: number) => {
    setRadarTabCount(Math.max(0, Math.round(count)));
  }, []);

  useEffect(() => {
    try {
      const savedView = parseRightRailView(
        window.localStorage.getItem(RIGHT_RAIL_VIEW_STORAGE_KEY),
      );
      if (savedView) {
        setRightRailView(savedView);
      }
    } catch {
      // ignore localStorage read errors
    }
    setRightRailViewHydrated(true);
  }, []);

  useEffect(() => {
    if (!rightRailViewHydrated) {
      return;
    }
    try {
      window.localStorage.setItem(RIGHT_RAIL_VIEW_STORAGE_KEY, rightRailView);
    } catch {
      // ignore localStorage write errors
    }
  }, [rightRailView, rightRailViewHydrated]);

  useEffect(() => {
    if (!isRightRailSwitching) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setIsRightRailSwitching(false);
    }, RIGHT_RAIL_SWITCH_DELAY_MS);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [isRightRailSwitching]);

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
      <section className="observer-main-column grid gap-5">
        <header className="card observer-feed-header overflow-hidden p-4 sm:p-5 lg:p-6">
          <div className="grid gap-4 sm:gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/25 bg-background/60 px-3 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider sm:py-2">
                <span>{t('feed.observerStream')}</span>
                <span aria-hidden="true">/</span>
                <span className="text-primary">{t('header.feeds')}</span>
              </p>
              <span className="tag-live inline-flex min-h-8 items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs uppercase tracking-wide sm:min-h-9 sm:px-3 sm:py-2">
                <span
                  aria-hidden="true"
                  className="icon-breathe live-dot inline-flex h-2.5 w-2.5 rounded-full"
                />
                {t('common.live')}
              </span>
            </div>
            <div className="grid gap-4 sm:gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="grid max-w-3xl gap-1.5 sm:gap-2">
                <h1 className="font-semibold text-[24px] text-foreground leading-tight sm:text-[28px] md:text-3xl">
                  {t('header.feeds')}
                </h1>
                <p className="text-muted-foreground text-sm md:text-base">
                  {t('feed.observerDescription')}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:w-auto md:justify-items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="inline-flex min-h-8 items-center rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1.5 font-semibold text-primary text-xs uppercase tracking-wide sm:min-h-9 sm:px-3 sm:py-2">
                    {t('header.observerMode')}
                  </span>
                  <button
                    aria-controls="feed-mobile-observer-nav"
                    aria-expanded={mobileSidebarOpen}
                    className="inline-flex min-h-8 items-center rounded-full border border-border/45 bg-[#1C2433] px-2.5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-[#243149] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2 lg:hidden"
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
              <div className="card p-4 text-muted-foreground text-sm sm:p-6">
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
        <section className="grid gap-5">
          <div
            aria-label="Right rail sections"
            className="no-scrollbar flex min-w-0 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto rounded-[1.5rem] border border-border/45 bg-card/62 p-0.5 pr-1 sm:snap-none sm:p-1 sm:pr-1.5"
            data-testid="feed-right-rail-tabs"
            role="tablist"
          >
            <button
              aria-controls="feed-right-rail-panel-live"
              aria-selected={rightRailView === 'live'}
              className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                rightRailView === 'live'
                  ? 'border-primary/55 bg-primary/14 text-primary'
                  : 'border-border/45 bg-[#1C2433] text-foreground hover:bg-[#243149] hover:text-primary'
              }`}
              data-testid="feed-right-rail-tab-live"
              id="feed-right-rail-tab-live"
              onClick={() => switchRightRailView('live')}
              onKeyDown={(event) => handleRightRailTabKeyDown(event, 'live')}
              ref={(node) => {
                rightRailTabRefs.current.live = node;
              }}
              role="tab"
              tabIndex={rightRailView === 'live' ? 0 : -1}
              type="button"
            >
              <span>{t('common.live')}</span>
              <span
                className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full border border-current/35 px-1.5 text-xs"
                data-testid="feed-right-rail-count-live"
              >
                {liveTabCount}
              </span>
            </button>
            <button
              aria-controls="feed-right-rail-panel-studio"
              aria-selected={rightRailView === 'studio'}
              className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                rightRailView === 'studio'
                  ? 'border-primary/55 bg-primary/14 text-primary'
                  : 'border-border/45 bg-[#1C2433] text-foreground hover:bg-[#243149] hover:text-primary'
              }`}
              data-testid="feed-right-rail-tab-studio"
              id="feed-right-rail-tab-studio"
              onClick={() => switchRightRailView('studio')}
              onKeyDown={(event) => handleRightRailTabKeyDown(event, 'studio')}
              ref={(node) => {
                rightRailTabRefs.current.studio = node;
              }}
              role="tab"
              tabIndex={rightRailView === 'studio' ? 0 : -1}
              type="button"
            >
              <span>{t('sidebar.studio')}</span>
              <span
                className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full border border-current/35 px-1.5 text-xs"
                data-testid="feed-right-rail-count-studio"
              >
                {studioTabCount}
              </span>
            </button>
            <button
              aria-controls="feed-right-rail-panel-radar"
              aria-selected={rightRailView === 'radar'}
              className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                rightRailView === 'radar'
                  ? 'border-primary/55 bg-primary/14 text-primary'
                  : 'border-border/45 bg-[#1C2433] text-foreground hover:bg-[#243149] hover:text-primary'
              }`}
              data-testid="feed-right-rail-tab-radar"
              id="feed-right-rail-tab-radar"
              onClick={() => switchRightRailView('radar')}
              onKeyDown={(event) => handleRightRailTabKeyDown(event, 'radar')}
              ref={(node) => {
                rightRailTabRefs.current.radar = node;
              }}
              role="tab"
              tabIndex={rightRailView === 'radar' ? 0 : -1}
              type="button"
            >
              <span>{t('rail.pulseRadar')}</span>
              <span
                className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full border border-current/35 px-1.5 text-xs"
                data-testid="feed-right-rail-count-radar"
              >
                {radarTabCount}
              </span>
            </button>
          </div>
          {isRightRailSwitching ? (
            <RightRailSkeleton view={rightRailView} />
          ) : (
            <>
              {rightRailView === 'live' ? (
                <div
                  aria-labelledby="feed-right-rail-tab-live"
                  id="feed-right-rail-panel-live"
                  role="tabpanel"
                >
                  <PanelErrorBoundary
                    description={t('error.refreshPage')}
                    retryLabel={t('common.retry')}
                    title={t('error.unexpected')}
                  >
                    <LiveStudioSessionsRail
                      onSessionCountChange={handleLiveCountChange}
                    />
                  </PanelErrorBoundary>
                </div>
              ) : null}
              {rightRailView === 'studio' ? (
                <div
                  aria-labelledby="feed-right-rail-tab-studio"
                  id="feed-right-rail-panel-studio"
                  role="tabpanel"
                >
                  <PanelErrorBoundary
                    description={t('error.refreshPage')}
                    retryLabel={t('common.retry')}
                    title={t('error.unexpected')}
                  >
                    <SwarmSessionsRail
                      onSessionCountChange={handleSwarmCountChange}
                    />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary
                    description={t('error.refreshPage')}
                    retryLabel={t('common.retry')}
                    title={t('error.unexpected')}
                  >
                    <CreatorStudiosRail
                      onStudioCountChange={handleCreatorCountChange}
                    />
                  </PanelErrorBoundary>
                </div>
              ) : null}
              {rightRailView === 'radar' ? (
                <div
                  aria-labelledby="feed-right-rail-tab-radar"
                  id="feed-right-rail-panel-radar"
                  role="tabpanel"
                >
                  <PanelErrorBoundary
                    description={t('error.refreshPage')}
                    retryLabel={t('common.retry')}
                    title={t('error.unexpected')}
                  >
                    <ObserverRightRail
                      onSignalCountChange={handleRadarCountChange}
                    />
                  </PanelErrorBoundary>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
      {mobileSidebarOpen && (
        <div
          aria-labelledby="mobile-observer-nav-title"
          aria-modal="true"
          className="overlay-backdrop fixed inset-0 z-[70] p-4 lg:hidden"
          id="feed-mobile-observer-nav"
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
                className="inline-flex min-h-8 items-center rounded-full border border-border/45 bg-[#1C2433] px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-[#243149] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2"
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

const RightRailSkeleton = ({ view }: { view: RightRailView }) => {
  if (view === 'studio') {
    return (
      <div className="grid gap-4" data-testid="feed-right-rail-skeleton">
        <div className="card rounded-[1.5rem] border-input bg-card p-5">
          <div className="h-6 w-2/5 animate-pulse rounded-lg bg-background/70" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-background/60" />
          <div className="mt-2 h-4 w-3/5 animate-pulse rounded bg-background/60" />
          <div className="mt-4 grid gap-2">
            <div className="h-10 animate-pulse rounded-xl bg-background/58" />
            <div className="h-10 animate-pulse rounded-xl bg-background/58" />
          </div>
        </div>
        <div className="card rounded-[1.5rem] border-input bg-card p-5">
          <div className="h-6 w-1/2 animate-pulse rounded-lg bg-background/70" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-background/60" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-background/60" />
          <div className="mt-4 h-12 animate-pulse rounded-xl bg-background/58" />
        </div>
      </div>
    );
  }

  if (view === 'radar') {
    return (
      <div className="grid gap-4" data-testid="feed-right-rail-skeleton">
        <div className="card rounded-[1.5rem] border-input bg-card p-5">
          <div className="h-6 w-1/2 animate-pulse rounded-lg bg-background/70" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-16 animate-pulse rounded-xl bg-background/58" />
            <div className="h-16 animate-pulse rounded-xl bg-background/58" />
            <div className="h-16 animate-pulse rounded-xl bg-background/58" />
            <div className="h-16 animate-pulse rounded-xl bg-background/58" />
          </div>
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-background/56" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="feed-right-rail-skeleton">
      <div className="card rounded-[1.5rem] border-input bg-card p-5">
        <div className="h-6 w-1/2 animate-pulse rounded-lg bg-background/70" />
        <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-background/60" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-background/60" />
        <div className="mt-4 grid gap-2">
          <div className="h-11 animate-pulse rounded-xl bg-background/58" />
          <div className="h-11 animate-pulse rounded-xl bg-background/58" />
          <div className="h-11 animate-pulse rounded-xl bg-background/58" />
        </div>
      </div>
    </div>
  );
};
