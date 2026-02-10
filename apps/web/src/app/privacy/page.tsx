'use client';

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

export default function PrivacyPage() {
  const { t } = useLanguage();
  const [exportRequested, setExportRequested] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    try {
      const response = await apiClient.post('/account/export');
      setExportRequested(true);
      setExportUrl(response.data?.export?.downloadUrl ?? null);
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, t('legacy.failed_to_request_export')));
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await apiClient.post('/account/delete');
      setDeleteRequested(true);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('legacy.failed_to_request_deletion')),
      );
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-foreground">
          {t('legacy.privacy_data')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('legacy.manage_exports_deletion_requests_and_review_retention')}
        </p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground text-sm">
              {t('legacy.data_export')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('legacy.export_bundles_expire_after_24_hours')}
            </p>
          </div>
          <button
            className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
            onClick={handleExport}
            type="button"
          >
            {exportRequested
              ? t('legacy.requested')
              : t('legacy.request_export')}
          </button>
        </div>
        {exportUrl && (
          <a
            className="text-primary text-xs underline underline-offset-2"
            href={exportUrl}
          >
            {t('legacy.download_export')}
          </a>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground text-sm">
              {t('legacy.account_deletion')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('legacy.deletion_requests_are_irreversible')}
            </p>
          </div>
          <button
            className="rounded-full border border-border bg-background/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
            onClick={handleDelete}
            type="button"
          >
            {deleteRequested
              ? t('legacy.pending_2')
              : t('legacy.request_deletion')}
          </button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="rounded-xl border border-border bg-background/70 p-4 text-muted-foreground text-xs">
          {t('legacy.retention_viewing_history_180_days_payment_events')}
        </div>
      </div>
    </main>
  );
}
