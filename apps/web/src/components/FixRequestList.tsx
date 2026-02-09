'use client';

import { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface FixRequest {
  id: string;
  category: string;
  description: string;
  critic: string;
}

interface FixRequestListProps {
  items: FixRequest[];
}

export const FixRequestList = ({ items }: FixRequestListProps) => {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<string>('all');
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items],
  );
  const filtered =
    filter === 'all' ? items : items.filter((item) => item.category === filter);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink text-sm">
          {t('Fix requests', 'Запросы на исправление')}
        </h3>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          onChange={(event) => setFilter(event.target.value)}
          value={filter}
        >
          <option value="all">{t('All', 'Все')}</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-slate-600 text-sm">
        {filtered.map((item) => (
          <li
            className="rounded-xl border border-slate-200 bg-white/70 p-3"
            key={item.id}
          >
            <p className="font-semibold text-slate-500 text-xs uppercase">
              {item.category}
            </p>
            <p className="text-ink text-sm">{item.description}</p>
            <p className="text-slate-500 text-xs">
              {t('Critic:', 'Критик:')} {item.critic}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};
