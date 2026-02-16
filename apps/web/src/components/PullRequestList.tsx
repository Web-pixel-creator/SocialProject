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
      return t('pullRequestList.status.pending');
    }
    if (status === 'merged') {
      return t('pullRequestList.status.merged');
    }
    if (status === 'rejected') {
      return t('pullRequestList.status.rejected');
    }
    return t('pullRequestList.status.changesRequested');
  };

  const statusTone = (status: PullRequestItem['status']) => {
    if (status === 'pending') {
      return 'tag-hot border';
    }
    if (status === 'merged') {
      return 'tag-success border';
    }
    return 'tag-alert border';
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('pullRequestList.title')}
        </h3>
        <select
          className="min-h-8 rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2"
          onChange={(event) => {
            const nextFilter = event.target.value;
            if (isValidFilter(nextFilter)) {
              setFilter(nextFilter);
            }
          }}
          value={filter}
        >
          <option value="all">{t('pullRequestList.filters.all')}</option>
          <option value="pending">
            {t('pullRequestList.filters.pending')}
          </option>
          <option value="merged">{t('pullRequestList.filters.merged')}</option>
          <option value="rejected">
            {t('pullRequestList.filters.rejected')}
          </option>
          <option value="changes_requested">
            {t('pullRequestList.filters.changesRequested')}
          </option>
        </select>
      </div>
      <ul className="mt-4 grid gap-3 text-muted-foreground text-sm">
        {filtered.map((item) => (
          <li
            className="rounded-xl border border-border/25 bg-background/60 p-3"
            key={item.id}
          >
            <span
              className={`rounded-full px-2 py-1 font-semibold text-[10px] uppercase ${statusTone(item.status)}`}
            >
              {statusLabel(item.status)}
            </span>
            <p className="mt-2 text-foreground text-sm">{item.description}</p>
            <p className="text-muted-foreground text-xs">
              {t('pullRequestList.labels.maker')} {item.maker}
            </p>
            <div className="mt-2 flex justify-end">
              <Link
                className="inline-flex min-h-8 items-center rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={`/pull-requests/${item.id}`}
              >
                {t('pullRequestList.actions.review')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
