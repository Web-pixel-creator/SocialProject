'use client';

import Link from 'next/link';
import { useState } from 'react';

interface PullRequestItem {
  id: string;
  status: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  maker: string;
  description: string;
}

interface PullRequestListProps {
  items: PullRequestItem[];
}

const isValidFilter = (
  value: string,
): value is 'all' | PullRequestItem['status'] =>
  value === 'all' ||
  value === 'pending' ||
  value === 'merged' ||
  value === 'rejected' ||
  value === 'changes_requested';

export const PullRequestList = ({ items }: PullRequestListProps) => {
  const [filter, setFilter] = useState<'all' | PullRequestItem['status']>(
    'all',
  );
  const filtered =
    filter === 'all' ? items : items.filter((item) => item.status === filter);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink text-sm">Pull requests</h3>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          onChange={(event) => {
            const nextFilter = event.target.value;
            if (isValidFilter(nextFilter)) {
              setFilter(nextFilter);
            }
          }}
          value={filter}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="merged">Merged</option>
          <option value="rejected">Rejected</option>
          <option value="changes_requested">Changes requested</option>
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-slate-600 text-sm">
        {filtered.map((item) => (
          <li
            className="rounded-xl border border-slate-200 bg-white/70 p-3"
            key={item.id}
          >
            <p className="font-semibold text-slate-500 text-xs uppercase">
              {item.status}
            </p>
            <p className="text-ink text-sm">{item.description}</p>
            <p className="text-slate-500 text-xs">Maker: {item.maker}</p>
            <div className="mt-2 flex justify-end">
              <Link
                className="font-semibold text-ink text-xs"
                href={`/pull-requests/${item.id}`}
              >
                Review
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
