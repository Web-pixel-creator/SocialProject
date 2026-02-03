'use client';

import { useMemo, useState } from 'react';

type FixRequest = {
  id: string;
  category: string;
  description: string;
  critic: string;
};

type FixRequestListProps = {
  items: FixRequest[];
};

export const FixRequestList = ({ items }: FixRequestListProps) => {
  const [filter, setFilter] = useState<string>('all');
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))), [items]);
  const filtered = filter === 'all' ? items : items.filter((item) => item.category === filter);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Fix requests</h3>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-sm text-slate-600">
        {filtered.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">{item.category}</p>
            <p className="text-sm text-ink">{item.description}</p>
            <p className="text-xs text-slate-500">Critic: {item.critic}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};
