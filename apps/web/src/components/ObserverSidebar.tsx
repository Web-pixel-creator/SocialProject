'use client';

import {
  BookMarked,
  Compass,
  Home,
  Search,
  Settings,
  ShieldCheck,
  Swords,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '../contexts/LanguageContext';

interface NavItem {
  href: string;
  icon: typeof Home;
  labelKey: string;
}

interface NavSection {
  id: string;
  titleKey: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    id: 'core',
    titleKey: 'sidebar.section.observer',
    items: [
      { href: '/feed', icon: Home, labelKey: 'sidebar.item.home' },
      { href: '/search', icon: Compass, labelKey: 'sidebar.item.explore' },
      {
        href: '/feed?tab=Battles',
        icon: Swords,
        labelKey: 'sidebar.item.battles',
      },
      { href: '/search', icon: Search, labelKey: 'sidebar.item.search' },
      {
        href: '/feed?tab=Studios',
        icon: Users,
        labelKey: 'sidebar.item.studios',
      },
    ],
  },
  {
    id: 'workspace',
    titleKey: 'sidebar.section.workspace',
    items: [
      {
        href: '/commissions',
        icon: Wallet,
        labelKey: 'sidebar.item.commissions',
      },
      {
        href: '/feed?tab=Archive',
        icon: BookMarked,
        labelKey: 'sidebar.item.bookmarks',
      },
      {
        href: '/privacy',
        icon: ShieldCheck,
        labelKey: 'sidebar.item.privacy',
      },
      {
        href: '/demo',
        icon: Settings,
        labelKey: 'sidebar.item.settings',
      },
    ],
  },
];

interface ObserverSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

const isNavItemActive = (
  href: string,
  pathname: string,
  tabValue: string | null,
): boolean => {
  const [basePath, queryString = ''] = href.split('?');
  if (basePath !== pathname) {
    return false;
  }

  if (!queryString) {
    if (basePath === '/feed' && tabValue && tabValue !== 'All') {
      return false;
    }
    return true;
  }

  const params = new URLSearchParams(queryString);
  const targetTab = params.get('tab');
  if (!targetTab) {
    return true;
  }

  return targetTab === tabValue;
};

export const ObserverSidebar = ({
  mobile = false,
  onNavigate,
}: ObserverSidebarProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabValue = searchParams?.get('tab') ?? null;
  const { t } = useLanguage();

  return (
    <aside
      className={
        mobile
          ? 'surface-strong rounded-2xl p-3'
          : 'observer-left-rail surface-strong hidden rounded-2xl p-3 lg:block'
      }
    >
      <div className="mb-4 rounded-xl border border-border bg-muted/70 p-3">
        <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {t('legacy.navigation')}
        </p>
        <p className="mt-1 text-foreground text-sm">
          {t('legacy.application_shell')}
        </p>
      </div>
      <nav aria-label={t('legacy.observer_navigation')} className="grid gap-4">
        {navSections.map((section) => (
          <section className="grid gap-1.5" key={section.id}>
            <p className="px-2 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-wide">
              {t(section.titleKey)}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item.href, pathname, tabValue);
              return (
                <Link
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                    active
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/35 hover:text-foreground'
                  }`}
                  href={item.href}
                  key={`${item.href}:${item.labelKey}`}
                  onClick={onNavigate}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </section>
        ))}
      </nav>
    </aside>
  );
};
