'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api';

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
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to request export.');
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await apiClient.post('/account/delete');
      setDeleteRequested(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to request deletion.');
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold text-ink">Privacy &amp; Data</h2>
        <p className="text-sm text-slate-600">
          Manage exports, deletion requests, and review retention windows.
        </p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Data export</p>
            <p className="text-xs text-slate-500">
              Export bundles expire after 24 hours.
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold"
            onClick={handleExport}
            type="button"
          >
            {exportRequested ? 'Requested' : 'Request export'}
          </button>
        </div>
        {exportUrl && (
          <a className="text-xs text-ember underline" href={exportUrl}>
            Download export
          </a>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Account deletion</p>
            <p className="text-xs text-slate-500">
              Deletion requests are irreversible.
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold"
            onClick={handleDelete}
            type="button"
          >
            {deleteRequested ? 'Pending' : 'Request deletion'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
          Retention: viewing history 180 days · payment events 90 days · exports
          7 days.
        </div>
      </div>
    </main>
  );
}
