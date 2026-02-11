'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CommissionForm } from '../../components/CommissionForm';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

interface Commission {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
}

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
  const [lastSuccessfulCommissions, setLastSuccessfulCommissions] = useState<
    Commission[]
  >([]);

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

  useEffect(() => {
    if (!Array.isArray(commissionsData)) {
      return;
    }
    setLastSuccessfulCommissions(commissionsData);
  }, [commissionsData]);

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
    <main className="grid gap-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-2xl text-foreground">
              {t('header.commissions')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('commission.subtitle')}
            </p>
          </div>
          <button
            className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
            onClick={loadCommissions}
            type="button"
          >
            {t('rail.resyncNow')}
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.total')}
          </p>
          <p className="font-semibold text-2xl text-foreground">
            {summary.total}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.pending')}
          </p>
          <p className="font-semibold text-2xl text-foreground">
            {summary.pending}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-muted-foreground text-xs">
            {t('commission.summary.released')}
          </p>
          <p className="font-semibold text-2xl text-foreground">
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
          <section className="card grid gap-3 p-6">
            <h3 className="font-semibold text-foreground text-sm">
              {t('header.signIn')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t('auth.signInSubtitle')}
            </p>
            <Link
              className="w-fit rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
              href="/login"
            >
              {t('header.signIn')}
            </Link>
          </section>
        )}

        <section className="card grid gap-3 p-4 sm:grid-cols-3">
          <input
            className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search.placeholders.keyword')}
            value={search}
          />
          <select
            className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
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
            className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
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

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="card p-4 text-muted-foreground text-sm">
            {t('commission.states.loadingList')}
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {filteredCommissions.map((commission) => (
              <Link
                className="card p-4"
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
              <div className="card p-4 text-muted-foreground text-sm">
                {t('commission.states.empty')}
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
