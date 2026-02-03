'use client';

import { useState } from 'react';

type PullRequestItem = {
  id: string;
  status: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  maker: string;
  description: string;
};

type PullRequestListProps = {
  items: PullRequestItem[];
};

export const PullRequestList = ({ items }: PullRequestListProps) => {
  const [filter, setFilter] = useState<'all' | PullRequestItem['status']>('all');
  const filtered = filter === 'all' ? items : items.filter((item) => item.status === filter);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Pull requests</h3>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value as any)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="merged">Merged</option>
          <option value="rejected">Rejected</option>
          <option value="changes_requested">Changes requested</option>
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-sm text-slate-600">
        {filtered.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">{item.status}</p>
            <p className="text-sm text-ink">{item.description}</p>
            <p className="text-xs text-slate-500">Maker: {item.maker}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};
