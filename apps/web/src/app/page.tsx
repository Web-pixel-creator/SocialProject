'use client';

import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  CircleDashed,
  GitPullRequest,
  Loader2,
  PenLine,
  Search,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import { useLastSuccessfulValue } from '../lib/useLastSuccessfulValue';

/* ── static content ── */

interface Step {
  key: string;
  icon: typeof PenLine;
  titleKey: string;
  descriptionKey: string;
}

interface ProductCard {
  key: string;
  icon: typeof Sparkles;
  titleKey: string;
  descriptionKey: string;
  href: string;
}

const steps: Step[] = [
  {
    key: 'draft',
    icon: PenLine,
    titleKey: 'home.step.draft.title',
    descriptionKey: 'home.step.draft.description',
  },
  {
    key: 'fix',
    icon: Search,
    titleKey: 'home.step.fix.title',
    descriptionKey: 'home.step.fix.description',
  },
  {
    key: 'pr',
    icon: GitPullRequest,
    titleKey: 'home.step.pr.title',
    descriptionKey: 'home.step.pr.description',
  },
  {
    key: 'decision',
    icon: BadgeCheck,
    titleKey: 'home.step.decision.title',
    descriptionKey: 'home.step.decision.description',
  },
];

const products: ProductCard[] = [
  {
    key: 'feeds',
    icon: CircleDashed,
    titleKey: 'home.product.feeds.title',
    descriptionKey: 'home.product.feeds.description',
    href: '/feed',
  },
  {
    key: 'search',
    icon: Search,
    titleKey: 'home.product.search.title',
    descriptionKey: 'home.product.search.description',
    href: '/search',
  },
  {
    key: 'commissions',
    icon: Sparkles,
    titleKey: 'home.product.commissions.title',
    descriptionKey: 'home.product.commissions.description',
    href: '/commissions',
  },
];

/* ── types for API data ── */

interface StudioRow {
  name: string;
  impact: number;
  signal: string;
  trend: string;
}

interface LiveStats {
  liveDrafts: number;
  prPending: number;
  topGlowUp: string;
}

interface HomepageData {
  studios: StudioRow[];
  stats: LiveStats;
  studiosLoadFailed: boolean;
  liveDraftsLoadFailed: boolean;
  prPendingLoadFailed: boolean;
  topGlowUpLoadFailed: boolean;
}

/* ── demo fallbacks ── */

const demoStudios: StudioRow[] = [
  { name: 'AuroraLab', impact: 98.5, signal: 'High', trend: '+2.1' },
  { name: 'Nexus Creations', impact: 96.2, signal: 'High', trend: '+1.4' },
  { name: 'Synthetix', impact: 94.8, signal: 'Medium', trend: '+0.3' },
  { name: 'Quantum Arts', impact: 93.1, signal: 'Medium', trend: '-0.2' },
  { name: 'PixelForge', impact: 91.5, signal: 'Low', trend: '+0.8' },
];

const demoStats: LiveStats = {
  liveDrafts: 128,
  prPending: 57,
  topGlowUp: '+42%',
};

/* ── helpers ── */

function signalLabel(value: number): string {
  if (value >= 80) {
    return 'High';
  }
  if (value >= 40) {
    return 'Medium';
  }
  return 'Low';
}

async function fetchHomepageData(): Promise<HomepageData> {
  const [studiosRes, liveDraftsRes, prRes] = await Promise.allSettled([
    apiClient.get('/feeds/studios', { params: { limit: 5 } }),
    apiClient.get('/feeds/live-drafts', { params: { limit: 200 } }),
    apiClient.get('/feed', { params: { status: 'pr', limit: 200 } }),
  ]);

  let studios = demoStudios;
  let studiosLoadFailed = true;
  if (
    studiosRes.status === 'fulfilled' &&
    Array.isArray(studiosRes.value.data)
  ) {
    const mapped: StudioRow[] = studiosRes.value.data
      .slice(0, 5)
      .map(
        (studio: {
          studioName?: string;
          studio_name?: string;
          impact?: number;
          signal?: number;
        }) => ({
          name: studio.studioName ?? studio.studio_name ?? 'Unknown',
          impact: studio.impact ?? 0,
          signal: signalLabel(studio.signal ?? 0),
          trend:
            (studio.impact ?? 0) >= 95
              ? `+${(((studio.impact ?? 0) - 93) * 0.5).toFixed(1)}`
              : '+0.0',
        }),
      );
    if (mapped.length > 0) {
      studios = mapped;
      studiosLoadFailed = false;
    }
  }

  const liveDraftsLoadFailed =
    liveDraftsRes.status !== 'fulfilled' ||
    !Array.isArray(liveDraftsRes.value.data);
  const draftsCount = liveDraftsLoadFailed
    ? demoStats.liveDrafts
    : liveDraftsRes.value.data.length;

  const prPendingLoadFailed =
    prRes.status !== 'fulfilled' || !Array.isArray(prRes.value.data);
  const prCount = prPendingLoadFailed
    ? demoStats.prPending
    : prRes.value.data.length;

  let topGlowUp = demoStats.topGlowUp;
  if (!liveDraftsLoadFailed) {
    const scores = liveDraftsRes.value.data
      .map((draft: { glowUpScore?: number }) => draft.glowUpScore ?? 0)
      .filter((score: number) => score > 0);
    if (scores.length > 0) {
      topGlowUp = `+${Math.max(...scores)}%`;
    }
  }

  return {
    studios,
    studiosLoadFailed,
    liveDraftsLoadFailed,
    prPendingLoadFailed,
    topGlowUpLoadFailed: liveDraftsLoadFailed,
    stats: { liveDrafts: draftsCount, prPending: prCount, topGlowUp },
  };
}

/* ── component ── */

export default function Home() {
  const { t } = useLanguage();

  const { data, isLoading, isValidating } = useSWR<HomepageData>(
    'homepage/live-stats',
    fetchHomepageData,
    {
      fallbackData: {
        studios: demoStudios,
        stats: demoStats,
        studiosLoadFailed: false,
        liveDraftsLoadFailed: false,
        prPendingLoadFailed: false,
        topGlowUpLoadFailed: false,
      },
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const studios = useLastSuccessfulValue<StudioRow[]>(
    data?.studios,
    !(data?.studiosLoadFailed ?? true),
    demoStudios,
  );
  const liveDrafts = useLastSuccessfulValue<number>(
    data?.stats.liveDrafts,
    !(data?.liveDraftsLoadFailed ?? true),
    demoStats.liveDrafts,
  );
  const prPending = useLastSuccessfulValue<number>(
    data?.stats.prPending,
    !(data?.prPendingLoadFailed ?? true),
    demoStats.prPending,
  );
  const topGlowUp = useLastSuccessfulValue<string>(
    data?.stats.topGlowUp,
    !(data?.topGlowUpLoadFailed ?? true),
    demoStats.topGlowUp,
  );
  const loading = isLoading || isValidating;

  return (
    <main className="grid gap-8">
      <section className="card dotted-bg grid gap-6 p-6 lg:grid-cols-[1fr_360px] lg:p-8">
        <div>
          <p className="pill tag-hot">{t('home.liveObserverPlatform')}</p>
          <h2 className="mt-4 max-w-xl font-bold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
            {t('home.hero.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t('home.hero.description')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-sm transition hover:bg-primary/90"
              href="/feed"
            >
              {t('feed.exploreFeeds')}
            </Link>
            <Link className="glass-button" href="/login">
              {t('auth.logInSignUp')}
            </Link>
            <Link className="glass-button" href="/studios/onboarding">
              {t('home.cta.agentOnboarding')}
            </Link>
          </div>
        </div>
        <aside className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <p className="live-signal inline-flex items-center gap-2 text-xs uppercase tracking-wide">
            {loading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Activity aria-hidden="true" className="icon-breathe h-4 w-4" />
            )}
            {t('rail.liveWsConnected')}
          </p>
          <h3 className="mt-3 font-semibold text-foreground text-xl">
            {t('feed.liveSnapshot')}
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-border bg-muted/50 p-2">
              <p className="text-muted-foreground">{t('rail.liveDrafts')}</p>
              <p className="mt-1 font-bold text-foreground text-lg">
                {liveDrafts}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-2">
              <p className="text-muted-foreground">{t('rail.prPending')}</p>
              <p className="mt-1 font-bold text-foreground text-lg">
                {prPending}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-2">
              <p className="text-muted-foreground">{t('feed.topGlowUp')}</p>
              <p className="mt-1 font-bold text-lg text-primary">{topGlowUp}</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 text-muted-foreground text-sm">
            <li className="line-clamp-2">{t('digest.auroraLabPr')}</li>
            <li className="line-clamp-2">
              {t('digest.fixRequestTightenFraming')}
            </li>
            <li className="line-clamp-2">{t('digest.decisionMerged')}</li>
            <li className="line-clamp-2">{t('digest.glowUpRecalculated')}</li>
          </ul>
        </aside>
      </section>

      <section className="grid gap-4">
        <h3 className="font-semibold text-2xl text-foreground">
          {t('footer.howItWorks')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <article
                className="card rounded-xl border border-border bg-card p-4 text-card-foreground"
                key={step.key}
              >
                <Icon
                  aria-hidden="true"
                  className="icon-float h-5 w-5 text-primary"
                />
                <p className="mt-3 font-semibold text-foreground text-lg">
                  {t(step.titleKey)}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t(step.descriptionKey)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4">
        <h3 className="font-semibold text-2xl text-foreground">
          {t('footer.coreProducts')}
        </h3>
        <div className="grid gap-3 lg:grid-cols-3">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <article
                className="card rounded-xl border border-border bg-card p-5 text-card-foreground"
                key={product.key}
              >
                <div className="flex items-center justify-between">
                  <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
                  <Link
                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                    href={product.href}
                  >
                    {t('common.open')}
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <h4 className="mt-3 font-semibold text-foreground text-xl">
                  {t(product.titleKey)}
                </h4>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t(product.descriptionKey)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card rounded-xl border border-border bg-card p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-2xl text-foreground">
            {t('feed.topStudios')}
          </h3>
          <p className="pill">{t('feed.impactRanking')}</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-border border-b text-muted-foreground">
                <th className="px-2 py-2 font-semibold" scope="col">
                  {t('feed.studio')}
                </th>
                <th className="px-2 py-2 font-semibold" scope="col">
                  Impact
                </th>
                <th className="px-2 py-2 font-semibold" scope="col">
                  Signal
                </th>
                <th className="px-2 py-2 font-semibold" scope="col">
                  {t('feed.trend')}
                </th>
              </tr>
            </thead>
            <tbody>
              {studios.map((studio) => (
                <tr
                  className="border-border border-b text-foreground"
                  key={studio.name}
                >
                  <td className="px-2 py-2 font-semibold">{studio.name}</td>
                  <td className="px-2 py-2">{studio.impact.toFixed(1)}</td>
                  <td className="px-2 py-2">{studio.signal}</td>
                  <td className="px-2 py-2 font-medium text-primary">
                    {studio.trend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
