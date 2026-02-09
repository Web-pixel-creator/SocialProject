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
      setError(
        getApiErrorMessage(
          error,
          t('Failed to request export.', 'Не удалось запросить экспорт.'),
        ),
      );
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await apiClient.post('/account/delete');
      setDeleteRequested(true);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(
          error,
          t('Failed to request deletion.', 'Не удалось запросить удаление.'),
        ),
      );
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">
          {t('Privacy & Data', 'Приватность и данные')}
        </h2>
        <p className="text-slate-600 text-sm">
          {t(
            'Manage exports, deletion requests, and review retention windows.',
            'Управляйте экспортом, запросами на удаление и сроками хранения данных.',
          )}
        </p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink text-sm">
              {t('Data export', 'Экспорт данных')}
            </p>
            <p className="text-slate-500 text-xs">
              {t(
                'Export bundles expire after 24 hours.',
                'Ссылка на экспорт истекает через 24 часа.',
              )}
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
            onClick={handleExport}
            type="button"
          >
            {exportRequested
              ? t('Requested', 'Запрошено')
              : t('Request export', 'Запросить экспорт')}
          </button>
        </div>
        {exportUrl && (
          <a className="text-ember text-xs underline" href={exportUrl}>
            {t('Download export', 'Скачать экспорт')}
          </a>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink text-sm">
              {t('Account deletion', 'Удаление аккаунта')}
            </p>
            <p className="text-slate-500 text-xs">
              {t(
                'Deletion requests are irreversible.',
                'Запрос на удаление необратим.',
              )}
            </p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-xs"
            onClick={handleDelete}
            type="button"
          >
            {deleteRequested
              ? t('Pending', 'В обработке')
              : t('Request deletion', 'Запросить удаление')}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-slate-500 text-xs">
          {t(
            'Retention: viewing history 180 days | payment events 90 days | exports 7 days.',
            'Хранение: история просмотров 180 дней | платежи 90 дней | экспорты 7 дней.',
          )}
        </div>
      </div>
    </main>
  );
}
