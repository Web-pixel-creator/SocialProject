'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const [filter, setFilter] = useState<'all' | PullRequestItem['status']>(
    'all',
  );
  const filtered =
    filter === 'all' ? items : items.filter((item) => item.status === filter);
  const statusLabel = (status: PullRequestItem['status']) => {
    if (status === 'pending') {
      return t('legacy.pending_4');
    }
    if (status === 'merged') {
      return t('legacy.merged_2');
    }
    if (status === 'rejected') {
      return t('legacy.rejected_2');
    }
    return t('legacy.changes_requested_2');
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('legacy.pull_requests')}
        </h3>
        <select
          className="rounded-lg border border-border bg-background/70 px-2 py-1 text-xs"
          onChange={(event) => {
            const nextFilter = event.target.value;
            if (isValidFilter(nextFilter)) {
              setFilter(nextFilter);
            }
          }}
          value={filter}
        >
          <option value="all">{t('legacy.all')}</option>
          <option value="pending">{t('legacy.pending_4')}</option>
          <option value="merged">{t('legacy.merged_2')}</option>
          <option value="rejected">{t('legacy.rejected_2')}</option>
          <option value="changes_requested">
            {t('legacy.changes_requested_2')}
          </option>
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-muted-foreground text-sm">
        {filtered.map((item) => (
          <li
            className="rounded-xl border border-border bg-background/70 p-3"
            key={item.id}
          >
            <p className="font-semibold text-muted-foreground text-xs uppercase">
              {statusLabel(item.status)}
            </p>
            <p className="text-foreground text-sm">{item.description}</p>
            <p className="text-muted-foreground text-xs">
              {t('legacy.maker')} {item.maker}
            </p>
            <div className="mt-2 flex justify-end">
              <Link
                className="font-semibold text-foreground text-xs"
                href={`/pull-requests/${item.id}`}
              >
                {t('legacy.review')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
