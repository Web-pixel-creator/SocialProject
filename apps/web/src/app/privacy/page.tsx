'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

interface DataExportRecord {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  downloadUrl?: string | null;
}

interface DeletionRecord {
  status: 'pending' | 'completed' | 'failed';
}

const EXPORT_ID_STORAGE_KEY = 'finishit-privacy-export-id';

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
  const lastSuccessfulExportStatusRef = useRef<DataExportRecord | null>(null);

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
    lastSuccessfulExportStatusRef.current = exportStatus;
    if (typeof exportStatus.downloadUrl === 'string') {
      const downloadUrl = exportStatus.downloadUrl;
      setExportUrl((previous) =>
        previous === downloadUrl ? previous : downloadUrl,
      );
    }
  }, [exportStatus]);

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
    exportStatus?.status ??
    lastSuccessfulExportStatusRef.current?.status ??
    null;
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
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-foreground">
          {t('privacy.header.title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('privacy.header.subtitle')}
        </p>
      </div>

      {authLoading ? (
        <div className="card p-4 text-muted-foreground text-sm">
          {t('search.states.loadingSearch')}
        </div>
      ) : null}

      {authLoading || isAuthenticated ? null : (
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

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4">
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
        <div className="card p-4">
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

      <div className="card grid gap-4 p-6">
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
            className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60 disabled:opacity-60"
            disabled={authLoading || !isAuthenticated || exportLoading}
            onClick={handleExport}
            type="button"
          >
            {exportButtonLabel}
          </button>
        </div>

        {exportId ? (
          <button
            className="w-fit rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60 disabled:opacity-60"
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
            className="w-fit text-primary text-xs underline underline-offset-2"
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
            className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60 disabled:opacity-60"
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

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {statusError ? (
          <p className="text-destructive text-xs">{statusError}</p>
        ) : null}

        <div className="rounded-xl border border-border bg-background/70 p-4 text-muted-foreground text-xs">
          {t('privacy.retention.note')}
        </div>
      </div>
    </main>
  );
}
