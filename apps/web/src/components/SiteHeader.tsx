'use client';

import { Eye, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ModeToggle } from './mode-toggle';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.getAttribute('role') === 'textbox';
};

export const SiteHeader = () => {
  const { t } = useLanguage();
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const isFeedPage = pathname === '/feed';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement | null>(null);
  const shouldFocusMobileSearchOnOpenRef = useRef(false);
  const previousBodyOverflowRef = useRef<string>('');
  const userLabel = user?.email?.split('@')[0] ?? user?.email ?? '';

  const links = [
    { href: '/feed', label: t('header.feeds') },
    { href: '/search', label: t('header.search') },
    { href: '/commissions', label: t('header.commissions') },
    {
      href: '/studios/onboarding',
      label: t('header.studioOnboarding'),
    },
    { href: '/demo', label: t('header.demo') },
    { href: '/privacy', label: t('header.privacy') },
  ];

  const desktopAuthControl = (() => {
    if (loading) {
      return null;
    }
    if (user) {
      return (
        <>
          <span className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs">
            {userLabel}
          </span>
          <button className="glass-button" onClick={logout} type="button">
            {t('header.signOut')}
          </button>
        </>
      );
    }
    return (
      <Link className="glass-button" href="/login">
        {t('header.signIn')}
      </Link>
    );
  })();

  const mobileAuthControl = (() => {
    if (loading) {
      return null;
    }
    if (user) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs">
            {userLabel}
          </span>
          <button className="glass-button" onClick={logout} type="button">
            {t('header.signOut')}
          </button>
        </div>
      );
    }
    return (
      <Link className="glass-button w-fit" href="/login">
        {t('header.signIn')}
      </Link>
    );
  })();

  useEffect(() => {
    if (pathname) {
      setMobileMenuOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/search' && pathname !== '/feed') {
      return;
    }
    const currentSearch = new URLSearchParams(window.location.search);
    setSearchQuery(currentSearch.get('q') ?? '');
  }, [pathname]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = searchQuery.trim();
    const currentParams = new URLSearchParams(window.location.search);

    if (nextQuery) {
      currentParams.set('q', nextQuery);
    } else {
      currentParams.delete('q');
    }

    if (pathname === '/feed') {
      const queryString = currentParams.toString();
      router.push(queryString ? `/feed?${queryString}` : '/feed');
      setMobileMenuOpen(false);
      return;
    }

    currentParams.set('mode', 'text');
    const queryString = currentParams.toString();
    router.push(queryString ? `/search?${queryString}` : '/search?mode=text');
    setMobileMenuOpen(false);
  };

  const clearSearchQuery = () => {
    setSearchQuery('');
    const isMobileViewport =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 767px)').matches;
    if (isMobileViewport) {
      mobileSearchInputRef.current?.focus();
      return;
    }
    desktopSearchInputRef.current?.focus();
  };

  const handleSearchInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (searchQuery.trim().length > 0) {
      setSearchQuery('');
      return;
    }
    event.currentTarget.blur();
  };

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = previousBodyOverflowRef.current;
      mobileToggleRef.current?.focus();
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (shouldFocusMobileSearchOnOpenRef.current) {
      shouldFocusMobileSearchOnOpenRef.current = false;
      mobileSearchInputRef.current?.focus();
    } else {
      firstMobileLinkRef.current?.focus();
    }
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflowRef.current;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleSlashShortcut = (event: KeyboardEvent) => {
      if (event.key !== '/') {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (pathname === '/feed' || pathname === '/search') {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
      if (!isMobileViewport) {
        desktopSearchInputRef.current?.focus();
        return;
      }

      if (mobileMenuOpen) {
        mobileSearchInputRef.current?.focus();
        return;
      }

      shouldFocusMobileSearchOnOpenRef.current = true;
      setMobileMenuOpen(true);
    };

    window.addEventListener('keydown', handleSlashShortcut);
    return () => {
      window.removeEventListener('keydown', handleSlashShortcut);
    };
  }, [mobileMenuOpen, pathname]);

  return (
    <header className="topbar-surface sticky top-3 z-50 mb-5 rounded-2xl border border-border/25 p-4 sm:p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="flex items-center gap-2 font-bold text-foreground text-lg tracking-tight sm:text-xl"
          href="/"
        >
          <span className="icon-breathe inline-flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground motion-reduce:animate-none sm:h-7 sm:w-7">
            F
          </span>
          FinishIt
        </Link>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {isFeedPage ? null : (
            <form
              className="hidden items-center rounded-full border border-border/25 bg-background/70 px-3 py-2 text-xs transition-colors hover:border-border/45 hover:bg-background/74 sm:flex"
              onSubmit={handleSearchSubmit}
            >
              <Search
                aria-hidden="true"
                className="mr-2 h-4 w-4 text-muted-foreground"
              />
              <input
                aria-keyshortcuts="/"
                aria-label={t('feed.searchAriaLabel')}
                className="w-52 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={t('header.searchPlaceholder')}
                ref={desktopSearchInputRef}
                type="search"
                value={searchQuery}
              />
              {searchQuery.trim().length > 0 ? (
                <button
                  aria-label={t('feedTabs.emptyAction.clearSearch')}
                  className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-background/58 text-muted-foreground transition hover:border-primary/40 hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                  onClick={clearSearchQuery}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                aria-label={t('header.search')}
                className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-background/58 text-muted-foreground transition hover:border-primary/40 hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                type="submit"
              >
                <Search aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
          <LanguageSwitcher />
          <ModeToggle />
          <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/35 bg-primary/12 px-3 py-1.5 font-semibold text-[11px] text-primary uppercase tracking-wide sm:min-h-9 sm:py-2 sm:text-xs">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t('header.observerMode')}
          </span>
          {desktopAuthControl}
        </div>
        <button
          aria-controls="mobile-site-menu"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? t('common.close') : t('common.menu')}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-background/58 text-foreground transition hover:bg-background/74 md:hidden ${focusRingClass}`}
          onClick={() => setMobileMenuOpen((current) => !current)}
          ref={mobileToggleRef}
          type="button"
        >
          {mobileMenuOpen ? (
            <X aria-hidden="true" className="h-5 w-5" />
          ) : (
            <Menu aria-hidden="true" className="h-5 w-5" />
          )}
        </button>
      </div>
      <nav className="mt-3 hidden flex-wrap items-center gap-2 font-semibold text-sm md:flex">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2 ${
                active
                  ? 'border-primary/45 bg-primary/10 text-primary'
                  : 'border-transparent bg-background/58 text-muted-foreground hover:bg-background/74 hover:text-foreground'
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      {mobileMenuOpen ? (
        <div
          aria-label={t('common.menu')}
          className="mt-3 grid gap-3 rounded-xl border border-border/25 bg-background/60 p-3 md:hidden"
          id="mobile-site-menu"
          role="dialog"
        >
          {isFeedPage ? null : (
            <form
              className="flex items-center rounded-full border border-border/25 bg-background/70 px-3 py-2 text-xs"
              onSubmit={handleSearchSubmit}
            >
              <Search
                aria-hidden="true"
                className="mr-2 h-4 w-4 text-muted-foreground"
              />
              <input
                aria-keyshortcuts="/"
                aria-label={t('feed.searchAriaLabel')}
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={t('header.searchPlaceholder')}
                ref={mobileSearchInputRef}
                type="search"
                value={searchQuery}
              />
              {searchQuery.trim().length > 0 ? (
                <button
                  aria-label={t('feedTabs.emptyAction.clearSearch')}
                  className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-background/58 text-muted-foreground transition hover:border-primary/40 hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                  onClick={clearSearchQuery}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                aria-label={t('header.search')}
                className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-background/58 text-muted-foreground transition hover:border-primary/40 hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                type="submit"
              >
                <Search aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
          <nav
            aria-label={t('common.menu')}
            className="grid gap-2 font-semibold text-sm"
          >
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-xl border px-3 py-2 transition ${focusRingClass} ${
                    active
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-transparent bg-background/58 text-muted-foreground hover:bg-background/74 hover:text-foreground'
                  }`}
                  href={link.href}
                  key={link.href}
                  ref={
                    link.href === links[0]?.href
                      ? firstMobileLinkRef
                      : undefined
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="grid gap-3 border-border/25 border-t pt-3">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <ModeToggle />
              <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/35 bg-primary/12 px-3 py-1.5 font-semibold text-[11px] text-primary uppercase tracking-wide sm:min-h-9 sm:py-2 sm:text-xs">
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                {t('header.observerMode')}
              </span>
            </div>
            {mobileAuthControl}
          </div>
        </div>
      ) : null}
    </header>
  );
};
