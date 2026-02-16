'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CommissionForm } from '../../components/CommissionForm';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';
import { useLastSuccessfulValue } from '../../lib/useLastSuccessfulValue';

interface Commission {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
}

const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const fetchCommissions = async (
  statusFilter: string,
): Promise<Commission[]> => {
  const response = await apiClient.get('/commissions', {
    params: statusFilter === 'all' ? undefined : { status: statusFilter },
  });
  return response.data ?? [];
};

export default function CommissionsPage() {
  const { t } = useLanguage();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  const {
    data: commissionsData,
    error: loadError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<Commission[]>(
    `commissions:list:${statusFilter}`,
    () => fetchCommissions(statusFilter),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const lastSuccessfulCommissions = useLastSuccessfulValue<Commission[]>(
    commissionsData,
    Array.isArray(commissionsData),
    [],
  );

  const commissions =
    commissionsData ?? (loadError ? lastSuccessfulCommissions : []);

  const error = loadError
    ? getApiErrorMessage(loadError, t('commission.errors.loadList'))
    : null;

  const loadCommissions = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const statusOptions = useMemo(() => {
    const options = new Set<string>();
    for (const commission of commissions) {
      options.add(commission.status);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [commissions]);

  const paymentOptions = useMemo(() => {
    const options = new Set<string>();
    for (const commission of commissions) {
      options.add(commission.paymentStatus);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [commissions]);

  const filteredCommissions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered: Commission[] = [];

    for (const commission of commissions) {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        commission.description.toLowerCase().includes(normalizedSearch) ||
        commission.id.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' || commission.status === statusFilter;
      const matchesPayment =
        paymentFilter === 'all' || commission.paymentStatus === paymentFilter;

      if (matchesSearch && matchesStatus && matchesPayment) {
        filtered.push(commission);
      }
    }

    return filtered;
  }, [commissions, paymentFilter, search, statusFilter]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== 'all' ||
    paymentFilter !== 'all';

  const resetFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setPaymentFilter('all');
  }, []);

  const summary = useMemo(() => {
    let pending = 0;
    let released = 0;

    for (const commission of commissions) {
      const status = commission.status.toLowerCase();
      if (status === 'pending') {
        pending += 1;
      }
      if (status === 'released' || status === 'completed') {
        released += 1;
      }
    }

    return {
      pending,
      released,
      total: commissions.length,
    };
  }, [commissions]);

  return (
    <main className="grid gap-4 sm:gap-5">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground text-xl sm:text-2xl">
              {t('header.commissions')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('commission.subtitle')}
            </p>
          </div>
          <button
            className={`rounded-full border border-transparent bg-background/56 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
            onClick={loadCommissions}
            type="button"
          >
            {t('rail.resyncNow')}
          </button>
        </div>
      </div>

      <section className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="card p-4 sm:p-5">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.total')}
          </p>
          <p className="font-semibold text-foreground text-xl sm:text-2xl">
            {summary.total}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.pending')}
          </p>
          <p className="font-semibold text-foreground text-xl sm:text-2xl">
            {summary.pending}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.released')}
          </p>
          <p className="font-semibold text-foreground text-xl sm:text-2xl">
            {summary.released}
          </p>
        </div>
      </section>

      <PanelErrorBoundary
        description={t('error.refreshPage')}
        retryLabel={t('common.retry')}
        title={t('error.unexpected')}
      >
        {authLoading ? (
          <div className="card p-4 text-muted-foreground text-sm">
            {t('search.states.loadingSearch')}
          </div>
        ) : null}

        {isAuthenticated ? (
          <CommissionForm onCreated={loadCommissions} />
        ) : (
          <section className="card grid gap-4 p-4 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('header.signIn')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t('auth.signInSubtitle')}
            </p>
            <Link
              className={`w-fit rounded-full border border-transparent bg-background/56 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-background/74 ${focusRingClass}`}
              href="/login"
            >
              {t('header.signIn')}
            </Link>
          </section>
        )}

        <section className="card grid gap-2.5 p-3 sm:grid-cols-3 sm:gap-3 sm:p-3.5">
          <input
            className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70 ${focusRingClass}`}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search.placeholders.keyword')}
            value={search}
          />
          <select
            className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm ${focusRingClass}`}
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">{t('feed.all')}</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm ${focusRingClass}`}
            onChange={(event) => setPaymentFilter(event.target.value)}
            value={paymentFilter}
          >
            <option value="all">{t('feed.all')}</option>
            {paymentOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </section>
        {hasActiveFilters ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {search.trim().length > 0 ? (
              <span className="pill normal-case tracking-normal">
                {search.trim()}
              </span>
            ) : null}
            {statusFilter !== 'all' ? (
              <span className="pill normal-case tracking-normal">
                {statusFilter}
              </span>
            ) : null}
            {paymentFilter !== 'all' ? (
              <span className="pill normal-case tracking-normal">
                {paymentFilter}
              </span>
            ) : null}
            <button
              className={`rounded-full border border-transparent bg-background/56 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
              onClick={resetFilters}
              type="button"
            >
              {t('search.actions.resetFilters')}
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-xs sm:p-3">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="card p-4 text-muted-foreground text-sm">
            {t('commission.states.loadingList')}
          </div>
        ) : (
          <section className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
            {filteredCommissions.map((commission) => (
              <Link
                className={`card p-3 transition hover:border-border/45 sm:p-4 ${focusRingClass}`}
                href={`/commissions/${commission.id}`}
                key={commission.id}
              >
                <p className="font-semibold text-muted-foreground text-xs uppercase">
                  {commission.status}
                </p>
                <p className="text-foreground text-sm">
                  {commission.description}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('commission.labels.reward')}{' '}
                  {commission.rewardAmount
                    ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
                    : t('commission.labels.na')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('commission.labels.payment')} {commission.paymentStatus}
                </p>
              </Link>
            ))}
            {filteredCommissions.length === 0 ? (
              <div className="card grid gap-3 p-3 text-muted-foreground text-sm sm:p-3.5">
                <p>
                  {hasActiveFilters
                    ? t('search.states.noResultsYet')
                    : t('commission.states.empty')}
                </p>
                {hasActiveFilters ? (
                  <button
                    className={`w-fit rounded-full border border-transparent bg-background/56 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                    onClick={resetFilters}
                    type="button"
                  >
                    {t('search.actions.resetFilters')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
        {isValidating && !isLoading ? (
          <p className="text-muted-foreground text-xs">
            {t('rail.loadingData')}
          </p>
        ) : null}
      </PanelErrorBoundary>
    </main>
  );
}
