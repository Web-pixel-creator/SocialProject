'use client';

import { Eye, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ModeToggle } from './mode-toggle';

export const SiteHeader = () => {
  const { t } = useLanguage();
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement | null>(null);
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
          <span className="rounded-full border border-border bg-muted/70 px-3 py-1.5 font-semibold text-foreground text-xs">
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
          <span className="rounded-full border border-border bg-muted/70 px-3 py-1.5 font-semibold text-foreground text-xs">
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
    firstMobileLinkRef.current?.focus();
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflowRef.current;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-4 z-50 mb-6 rounded-2xl border border-border bg-background/90 p-4 backdrop-blur lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="flex items-center gap-2 font-bold text-foreground text-xl tracking-tight"
          href="/"
        >
          <span className="icon-breathe inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-black motion-reduce:animate-none">
            F
          </span>
          FinishIt
        </Link>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <form
            className="hidden items-center rounded-full border border-border bg-muted/50 px-3 py-2 text-xs transition-colors hover:bg-muted sm:flex"
            onSubmit={handleSearchSubmit}
          >
            <Search
              aria-hidden="true"
              className="mr-2 h-4 w-4 text-muted-foreground"
            />
            <input
              aria-label={t('feed.searchAriaLabel')}
              className="w-52 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('header.searchPlaceholder')}
              type="search"
              value={searchQuery}
            />
            <button
              aria-label={t('header.search')}
              className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-muted-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="submit"
            >
              <Search aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </form>
          <LanguageSwitcher />
          <ModeToggle />
          <span className="tag-hot inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold text-[11px] uppercase tracking-wide">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t('header.observerMode')}
          </span>
          {desktopAuthControl}
        </div>
        <button
          aria-controls="mobile-site-menu"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? t('common.close') : t('common.menu')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/70 text-foreground transition hover:bg-muted md:hidden"
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
      <nav className="mt-4 hidden flex-wrap items-center gap-2 font-semibold text-sm md:flex">
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
      </nav>
      {mobileMenuOpen ? (
        <div
          aria-label={t('common.menu')}
          className="mt-4 grid gap-4 rounded-xl border border-border bg-background/80 p-4 md:hidden"
          id="mobile-site-menu"
          role="dialog"
        >
          <form
            className="flex items-center rounded-full border border-border bg-muted/50 px-3 py-2 text-xs"
            onSubmit={handleSearchSubmit}
          >
            <Search
              aria-hidden="true"
              className="mr-2 h-4 w-4 text-muted-foreground"
            />
            <input
              aria-label={t('feed.searchAriaLabel')}
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('header.searchPlaceholder')}
              type="search"
              value={searchQuery}
            />
            <button
              aria-label={t('header.search')}
              className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-muted-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="submit"
            >
              <Search aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </form>
          <nav
            aria-label={t('common.menu')}
            className="grid gap-2 font-semibold text-sm"
          >
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  className={`rounded-xl border px-3 py-2 transition ${
                    active
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground'
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
          <div className="grid gap-3 border-border border-t pt-3">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <ModeToggle />
              <span className="tag-hot inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold text-[11px] uppercase tracking-wide">
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
