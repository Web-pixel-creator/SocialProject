'use client';

import {
  BarChart3,
  Home,
  Search,
  Settings,
  ShieldCheck,
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

const buildNavSections = (showAdminUxLink: boolean): NavSection[] => [
  {
    id: 'core',
    titleKey: 'sidebar.section.observer',
    items: [
      { href: '/feed', icon: Home, labelKey: 'sidebar.item.home' },
      { href: '/search', icon: Search, labelKey: 'sidebar.item.search' },
      {
        href: '/commissions',
        icon: Wallet,
        labelKey: 'sidebar.item.commissions',
      },
    ],
  },
  {
    id: 'workspace',
    titleKey: 'sidebar.section.workspace',
    items: [
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
      ...(showAdminUxLink
        ? [
            {
              href: '/admin/ux',
              icon: BarChart3,
              labelKey: 'sidebar.item.adminUx',
            },
          ]
        : []),
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
  const showAdminUxLink =
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK === 'true';
  const navSections = buildNavSections(showAdminUxLink);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabValue = searchParams?.get('tab') ?? null;
  const { t } = useLanguage();

  return (
    <aside
      aria-label={t('sidebar.observerNavigation')}
      className={
        mobile
          ? 'rounded-2xl bg-sidebar/70 p-3'
          : 'observer-left-rail hidden rounded-2xl bg-sidebar/70 p-3 lg:block'
      }
    >
      <nav aria-label={t('sidebar.observerNavigation')} className="grid gap-4">
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
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active
                      ? 'border-primary/35 bg-primary/12 text-primary'
                      : 'border-transparent bg-background/58 text-muted-foreground hover:bg-background/74 hover:text-foreground'
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
