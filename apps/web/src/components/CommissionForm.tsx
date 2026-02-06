'use client';

import { type FormEvent, useState } from 'react';
import { apiClient } from '../lib/api';

type CommissionFormProps = {
  onCreated?: () => void;
};

export const CommissionForm = ({ onCreated }: CommissionFormProps) => {
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
        throw new Error('Invalid reward amount.');
      }
      await apiClient.post('/commissions', {
        description,
        rewardAmount,
        currency,
      });
      setStatus('success');
      setDescription('');
      setReward('');
      if (onCreated) onCreated();
    } catch (err: any) {
      setStatus('error');
      setError(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to create commission.',
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-4 p-6">
      <h3 className="text-sm font-semibold text-ink">Create commission</h3>
      <textarea
        className="min-h-[120px] rounded-xl border border-slate-200 bg-white p-3 text-sm"
        placeholder="Describe the creative brief"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="Reward amount"
          value={reward}
          onChange={(event) => setReward(event.target.value)}
        />
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white shadow-glow"
        disabled={status === 'loading'}
        type="submit"
      >
        {status === 'loading' ? 'Posting…' : 'Post'}
      </button>
      {status === 'success' && (
        <p className="text-xs text-emerald-600">Commission created.</p>
      )}
    </form>
  );
};
