'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';
import { useLastSuccessfulValue } from '../../lib/useLastSuccessfulValue';

interface DataExportRecord {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  downloadUrl?: string | null;
}

interface DeletionRecord {
  status: 'pending' | 'completed' | 'failed';
}

const EXPORT_ID_STORAGE_KEY = 'finishit-privacy-export-id';
const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const fetchExportStatus = async (
  exportId: string,
): Promise<DataExportRecord> => {
  const response = await apiClient.get(`/account/exports/${exportId}`);
  return response.data;
};

export default function PrivacyPage() {
  const { t } = useLanguage();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [exportId, setExportId] = useState<string | null>(null);
  const [exportRequested, setExportRequested] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: exportStatus,
    error: exportStatusLoadError,
    isLoading: exportStatusLoading,
    isValidating: exportStatusValidating,
    mutate: mutateExportStatus,
  } = useSWR<DataExportRecord>(
    exportId ? `privacy:export:${exportId}` : null,
    () => fetchExportStatus(exportId as string),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const { trigger: requestExport, isMutating: exportLoading } = useSWRMutation<
    Partial<DataExportRecord> | undefined,
    unknown,
    string,
    void
  >('privacy:request-export', async () => {
    const response = await apiClient.post('/account/export');
    return response.data?.export as Partial<DataExportRecord> | undefined;
  });

  const { trigger: requestDeletion, isMutating: deleteLoading } =
    useSWRMutation<Partial<DeletionRecord> | undefined, unknown, string, void>(
      'privacy:request-deletion',
      async () => {
        const response = await apiClient.post('/account/delete');
        return response.data as Partial<DeletionRecord> | undefined;
      },
    );

  useEffect(() => {
    try {
      const storedExportId = window.localStorage.getItem(EXPORT_ID_STORAGE_KEY);
      if (!storedExportId) {
        return;
      }
      setExportId(storedExportId);
      setExportRequested(true);
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    if (!exportStatus?.id) {
      return;
    }
    if (typeof exportStatus.downloadUrl === 'string') {
      const downloadUrl = exportStatus.downloadUrl;
      setExportUrl((previous) =>
        previous === downloadUrl ? previous : downloadUrl,
      );
    }
  }, [exportStatus]);

  const lastSuccessfulExportStatus =
    useLastSuccessfulValue<DataExportRecord | null>(
      exportStatus,
      Boolean(exportStatus?.id),
      null,
    );

  const handleExport = async () => {
    if (!isAuthenticated || exportLoading) {
      return;
    }
    setError(null);
    try {
      const exportPayload = await requestExport();
      setExportRequested(true);
      if (typeof exportPayload?.downloadUrl === 'string') {
        setExportUrl(exportPayload.downloadUrl);
      } else {
        setExportUrl(null);
      }
      if (typeof exportPayload?.id === 'string') {
        setExportId(exportPayload.id);
        try {
          window.localStorage.setItem(EXPORT_ID_STORAGE_KEY, exportPayload.id);
        } catch {
          // ignore localStorage write errors
        }
        await mutateExportStatus(
          {
            id: exportPayload.id,
            status:
              (exportPayload.status as DataExportRecord['status']) ?? 'ready',
            downloadUrl:
              typeof exportPayload.downloadUrl === 'string'
                ? exportPayload.downloadUrl
                : null,
          },
          { revalidate: false },
        );
      }
    } catch (typedError: unknown) {
      setError(
        getApiErrorMessage(typedError, t('privacy.errors.requestExport')),
      );
    }
  };

  const handleDelete = async () => {
    if (!isAuthenticated || deleteRequested || deleteLoading) {
      return;
    }
    setError(null);
    try {
      const deletionPayload = await requestDeletion();
      setDeleteRequested(
        deletionPayload?.status === 'completed' ||
          deletionPayload?.status === 'pending' ||
          deletionPayload?.status === undefined,
      );
    } catch (typedError: unknown) {
      setError(
        getApiErrorMessage(typedError, t('privacy.errors.requestDeletion')),
      );
    }
  };

  const statusError = exportStatusLoadError
    ? getApiErrorMessage(
        exportStatusLoadError,
        t('privacy.errors.requestExport'),
      )
    : null;

  const effectiveExportStatus =
    exportStatus?.status ?? lastSuccessfulExportStatus?.status ?? null;
  const exportDone = effectiveExportStatus === 'ready' || Boolean(exportUrl);
  const exportStatusLabel = exportDone
    ? t('privacy.status.done')
    : t('privacy.status.pending');

  let exportButtonLabel = t('privacy.actions.requestExport');
  if (exportLoading) {
    exportButtonLabel = t('privacy.actions.running');
  } else if (exportRequested || exportDone) {
    exportButtonLabel = t('privacy.actions.requested');
  }

  let deleteButtonLabel = t('privacy.actions.requestDeletion');
  if (deleteLoading) {
    deleteButtonLabel = t('privacy.actions.running');
  } else if (deleteRequested) {
    deleteButtonLabel = t('privacy.status.pending');
  }

  return (
    <main className="grid gap-4 sm:gap-5">
      <div className="card p-4 sm:p-5">
        <h2 className="font-semibold text-foreground text-xl sm:text-2xl">
          {t('privacy.header.title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('privacy.header.subtitle')}
        </p>
      </div>

      {authLoading ? (
        <div className="card p-3 text-muted-foreground text-sm sm:p-3.5">
          {t('search.states.loadingSearch')}
        </div>
      ) : null}

      {authLoading || isAuthenticated ? null : (
        <section className="card grid gap-4 p-4 sm:p-5">
          <h3 className="font-semibold text-foreground text-sm">
            {t('header.signIn')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t('auth.signInSubtitle')}
          </p>
          <Link
            className={`w-fit rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
            href="/login"
          >
            {t('header.signIn')}
          </Link>
        </section>
      )}

      <section className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
        <div className="card p-3 sm:p-3.5">
          <p className="text-muted-foreground text-xs">
            {t('privacy.cards.dataExport')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {exportStatusLabel}
          </p>
          {exportId && (
            <p className="mt-1 break-all text-muted-foreground text-xs">
              {exportId}
            </p>
          )}
        </div>
        <div className="card p-3 sm:p-3.5">
          <p className="text-muted-foreground text-xs">
            {t('privacy.cards.accountDeletion')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {deleteRequested
              ? t('privacy.status.done')
              : t('privacy.status.pending')}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="pill normal-case tracking-normal">
          {t('privacy.cards.dataExport')}: {exportStatusLabel}
        </span>
        <span className="pill normal-case tracking-normal">
          {t('privacy.cards.accountDeletion')}:{' '}
          {deleteRequested
            ? t('privacy.status.done')
            : t('privacy.status.pending')}
        </span>
        {exportStatusValidating && !exportStatusLoading ? (
          <span className="text-muted-foreground">{t('rail.loadingData')}</span>
        ) : null}
      </div>

      <div className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground text-sm">
              {t('privacy.cards.dataExport')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('privacy.export.expiration')}
            </p>
          </div>
          <button
            className={`rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 disabled:opacity-60 sm:py-2 ${focusRingClass}`}
            disabled={authLoading || !isAuthenticated || exportLoading}
            onClick={handleExport}
            type="button"
          >
            {exportButtonLabel}
          </button>
        </div>

        {exportId ? (
          <button
            className={`w-fit rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 disabled:opacity-60 sm:py-2 ${focusRingClass}`}
            disabled={
              authLoading ||
              !isAuthenticated ||
              exportStatusLoading ||
              exportStatusValidating
            }
            onClick={() => {
              setError(null);
              mutateExportStatus();
            }}
            type="button"
          >
            {exportStatusLoading || exportStatusValidating
              ? t('privacy.actions.running')
              : t('rail.resyncNow')}
          </button>
        ) : null}

        {exportUrl ? (
          <a
            className={`w-fit rounded-full border border-transparent bg-background/58 px-4 py-1.5 text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
            href={exportUrl}
          >
            {t('privacy.export.download')}
          </a>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground text-sm">
              {t('privacy.cards.accountDeletion')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('privacy.deletion.irreversible')}
            </p>
          </div>
          <button
            className={`rounded-full border border-transparent bg-background/58 px-4 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 disabled:opacity-60 sm:py-2 ${focusRingClass}`}
            disabled={
              authLoading ||
              !isAuthenticated ||
              deleteRequested ||
              deleteLoading
            }
            onClick={handleDelete}
            type="button"
          >
            {deleteButtonLabel}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-2 text-destructive text-xs">
            {error}
          </div>
        ) : null}
        {statusError ? (
          <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-2 text-destructive text-xs">
            {statusError}
          </div>
        ) : null}

        <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-muted-foreground text-xs sm:p-3.5">
          {t('privacy.retention.note')}
        </div>
      </div>
    </main>
  );
}
