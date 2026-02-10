'use client';

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

export default function PrivacyPage() {
  const { t } = useLanguage();
  const [exportRequested, setExportRequested] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (exportRequested || exportLoading) {
      return;
    }
    setError(null);
    setExportLoading(true);
    try {
      const response = await apiClient.post('/account/export');
      setExportRequested(true);
      setExportUrl(response.data?.export?.downloadUrl ?? null);
    } catch (typedError: unknown) {
      setError(
        getApiErrorMessage(typedError, t('privacy.errors.requestExport')),
      );
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteRequested || deleteLoading) {
      return;
    }
    setError(null);
    setDeleteLoading(true);
    try {
      await apiClient.post('/account/delete');
      setDeleteRequested(true);
    } catch (typedError: unknown) {
      setError(
        getApiErrorMessage(typedError, t('privacy.errors.requestDeletion')),
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  let exportButtonLabel = t('privacy.actions.requestExport');
  if (exportLoading) {
    exportButtonLabel = t('privacy.actions.running');
  } else if (exportRequested) {
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

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-muted-foreground text-xs">
            {t('privacy.cards.dataExport')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {exportRequested
              ? t('privacy.status.done')
              : t('privacy.status.pending')}
          </p>
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
            disabled={exportRequested || exportLoading}
            onClick={handleExport}
            type="button"
          >
            {exportButtonLabel}
          </button>
        </div>

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
            disabled={deleteRequested || deleteLoading}
            onClick={handleDelete}
            type="button"
          >
            {deleteButtonLabel}
          </button>
        </div>

        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        <div className="rounded-xl border border-border bg-background/70 p-4 text-muted-foreground text-xs">
          {t('privacy.retention.note')}
        </div>
      </div>
    </main>
  );
}
