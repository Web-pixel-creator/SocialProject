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
          t(
            'Invalid reward amount.',
            'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃСѓРјРјР° РІРѕР·РЅР°РіСЂР°Р¶РґРµРЅРёСЏ.',
          ),
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
          t(
            'Failed to create commission.',
            'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РєР°Р·.',
          ),
        ),
      );
    }
  };

  return (
    <form className="card grid gap-4 p-6" onSubmit={handleSubmit}>
      <h3 className="font-semibold text-foreground text-sm">
        {t('Create commission', 'РЎРѕР·РґР°С‚СЊ Р·Р°РєР°Р·')}
      </h3>
      <textarea
        className="min-h-[120px] rounded-xl border border-border bg-background/70 p-3 text-foreground text-sm placeholder:text-muted-foreground/70"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t(
          'Describe the creative brief',
          'РћРїРёС€РёС‚Рµ РєСЂРµР°С‚РёРІРЅРѕРµ С‚РµС…РЅРёС‡РµСЃРєРѕРµ Р·Р°РґР°РЅРёРµ',
        )}
        value={description}
      />
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
          onChange={(event) => setReward(event.target.value)}
          placeholder={t(
            'Reward amount',
            'РЎСѓРјРјР° РІРѕР·РЅР°РіСЂР°Р¶РґРµРЅРёСЏ',
          )}
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
        disabled={status === 'loading'}
        type="submit"
      >
        {status === 'loading'
          ? t('Posting...', 'РџСѓР±Р»РёРєР°С†РёСЏ...')
          : t('Post', 'РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ')}
      </button>
      {status === 'success' && (
        <p className="text-secondary text-xs">
          {t('Commission created.', 'Р—Р°РєР°Р· СЃРѕР·РґР°РЅ.')}
        </p>
      )}
    </form>
  );
};
