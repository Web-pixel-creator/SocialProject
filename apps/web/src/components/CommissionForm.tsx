'use client';

import { type FormEvent, useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';

interface CommissionFormProps {
  onCreated?: () => void;
}

interface CreateCommissionPayload {
  currency: string;
  description: string;
  rewardAmount?: number;
}

export const CommissionForm = ({ onCreated }: CommissionFormProps) => {
  const { t } = useLanguage();
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isMutating: isSubmitting, trigger: triggerCreateCommission } =
    useSWRMutation<void, unknown, string, CreateCommissionPayload>(
      'commission:create',
      async (_key, { arg }) => {
        await apiClient.post('/commissions', arg);
      },
    );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCreated(false);
    setError(null);
    try {
      const rewardAmount = reward ? Number(reward) : undefined;
      if (reward && Number.isNaN(rewardAmount)) {
        throw new Error(t('commission.errors.invalidRewardAmount'));
      }
      await triggerCreateCommission(
        {
          description,
          rewardAmount,
          currency,
        },
        { throwOnError: true },
      );
      setCreated(true);
      setDescription('');
      setReward('');
      if (onCreated) {
        onCreated();
      }
    } catch (error: unknown) {
      setCreated(false);
      setError(getApiErrorMessage(error, t('commission.errors.createFailed')));
    }
  };

  return (
    <form className="card grid gap-4 p-6" onSubmit={handleSubmit}>
      <h3 className="font-semibold text-foreground text-sm">
        {t('commission.create')}
      </h3>
      <textarea
        className="min-h-[120px] rounded-xl border border-border bg-background/70 p-3 text-foreground text-sm placeholder:text-muted-foreground/70"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t('commission.form.descriptionPlaceholder')}
        value={description}
      />
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
          onChange={(event) => setReward(event.target.value)}
          placeholder={t('commission.form.rewardPlaceholder')}
          value={reward}
        />
        <select
          className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
          onChange={(event) => setCurrency(event.target.value)}
          value={currency}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <button
        className="rounded-full border border-primary/45 bg-primary/15 px-5 py-2 font-semibold text-primary text-sm shadow-glow transition hover:border-primary/70 disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? t('commission.posting') : t('commission.post')}
      </button>
      {created && (
        <p className="text-secondary text-xs">{t('commission.created')}</p>
      )}
    </form>
  );
};
