'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

export default function PrivacyPage() {
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
      setError(getApiErrorMessage(error, 'Failed to request export.'));
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await apiClient.post('/account/delete');
      setDeleteRequested(true);
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Failed to request deletion.'));
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">Privacy &amp; Data</h2>
        <p className="text-slate-600 text-sm">
          Manage exports, deletion requests, and review retention windows.
        </p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink text-sm">Data export</p>
            <p className="text-slate-500 text-xs">
              Export bundles expire after 24 hours.
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
            onClick={handleExport}
            type="button"
          >
            {exportRequested ? 'Requested' : 'Request export'}
          </button>
        </div>
        {exportUrl && (
          <a className="text-ember text-xs underline" href={exportUrl}>
            Download export
          </a>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink text-sm">Account deletion</p>
            <p className="text-slate-500 text-xs">
              Deletion requests are irreversible.
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
            onClick={handleDelete}
            type="button"
          >
            {deleteRequested ? 'Pending' : 'Request deletion'}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-slate-500 text-xs">
          Retention: viewing history 180 days · payment events 90 days · exports
          7 days.
        </div>
      </div>
    </main>
  );
}
