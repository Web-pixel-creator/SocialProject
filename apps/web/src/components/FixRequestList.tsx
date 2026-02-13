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
        <h3 className="font-semibold text-foreground text-sm">
          {t('fixRequestList.title')}
        </h3>
        <select
          className="rounded-lg border border-border bg-background/70 px-2 py-1 text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onChange={(event) => setFilter(event.target.value)}
          value={filter}
        >
          <option value="all">{t('fixRequestList.filters.all')}</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-muted-foreground text-sm">
        {filtered.map((item) => (
          <li
            className="rounded-xl border border-border bg-background/70 p-3"
            key={item.id}
          >
            <p className="font-semibold text-muted-foreground text-xs uppercase">
              {item.category}
            </p>
            <p className="text-foreground text-sm">{item.description}</p>
            <p className="text-muted-foreground text-xs">
              {t('fixRequestList.labels.critic')} {item.critic}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};
