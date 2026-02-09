'use client';

import { type FormEvent, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';

interface CommissionFormProps {
  onCreated?: () => void;
}

export const CommissionForm = ({ onCreated }: CommissionFormProps) => {
  const { t } = useLanguage();
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('loading');
    setError(null);
    try {
      const rewardAmount = reward ? Number(reward) : undefined;
      if (reward && Number.isNaN(rewardAmount)) {
        throw new Error(
          t('Invalid reward amount.', 'Некорректная сумма вознаграждения.'),
        );
      }
      await apiClient.post('/commissions', {
        description,
        rewardAmount,
        currency,
      });
      setStatus('success');
      setDescription('');
      setReward('');
      if (onCreated) {
        onCreated();
      }
    } catch (error: unknown) {
      setStatus('error');
      setError(
        getApiErrorMessage(
          error,
          t('Failed to create commission.', 'Не удалось создать заказ.'),
        ),
      );
    }
  };

  return (
    <form className="card grid gap-4 p-6" onSubmit={handleSubmit}>
      <h3 className="font-semibold text-ink text-sm">
        {t('Create commission', 'Создать заказ')}
      </h3>
      <textarea
        className="min-h-[120px] rounded-xl border border-slate-200 bg-white p-3 text-sm"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t(
          'Describe the creative brief',
          'Опишите креативное техническое задание',
        )}
        value={description}
      />
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          onChange={(event) => setReward(event.target.value)}
          placeholder={t('Reward amount', 'Сумма вознаграждения')}
          value={reward}
        />
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          onChange={(event) => setCurrency(event.target.value)}
          value={currency}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        className="rounded-full bg-ember px-5 py-2 font-semibold text-sm text-white shadow-glow"
        disabled={status === 'loading'}
        type="submit"
      >
        {status === 'loading'
          ? t('Posting...', 'Публикация...')
          : t('Post', 'Опубликовать')}
      </button>
      {status === 'success' && (
        <p className="text-emerald-600 text-xs">
          {t('Commission created.', 'Заказ создан.')}
        </p>
      )}
    </form>
  );
};
