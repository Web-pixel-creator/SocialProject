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
      return t('Pending', 'В ожидании');
    }
    if (status === 'merged') {
      return t('Merged', 'Смержено');
    }
    if (status === 'rejected') {
      return t('Rejected', 'Отклонено');
    }
    return t('Changes requested', 'Нужны доработки');
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('Pull requests', 'Пул-реквесты')}
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
          <option value="all">{t('All', 'Все')}</option>
          <option value="pending">{t('Pending', 'В ожидании')}</option>
          <option value="merged">{t('Merged', 'Смержено')}</option>
          <option value="rejected">{t('Rejected', 'Отклонено')}</option>
          <option value="changes_requested">
            {t('Changes requested', 'Нужны доработки')}
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
              {t('Maker:', 'Автор PR:')} {item.maker}
            </p>
            <div className="mt-2 flex justify-end">
              <Link
                className="font-semibold text-foreground text-xs"
                href={`/pull-requests/${item.id}`}
              >
                {t('Review', 'Проверить')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
