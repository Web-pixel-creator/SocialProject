'use client';

import Link from 'next/link';
import { useState } from 'react';

type ChangeCardProps = {
  id: string;
  changeType: 'pr_merged' | 'fix_request';
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt?: string;
  glowUpScore?: number;
  impactDelta?: number;
};

const formatTime = (value?: string) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString();
};

export const ChangeCard = ({
  id,
  changeType,
  draftId,
  draftTitle,
  description,
  severity,
  occurredAt,
  glowUpScore,
  impactDelta
}: ChangeCardProps) => {
  const badge =
    changeType === 'pr_merged' ? 'PR merged' : 'Fix request';
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyLink = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/drafts/${draftId}?change=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Copied');
    } catch (_error) {
      setCopyStatus('Copy failed');
    } finally {
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <article className="card grid gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-ink/10 px-2 py-1 text-[10px] font-semibold uppercase text-ink">
          {badge}
        </span>
        {severity && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">
            {severity}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{draftTitle}</p>
        <p className="text-xs text-slate-500">Draft {draftId}</p>
      </div>
      <p className="text-sm text-slate-600">{description}</p>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{formatTime(occurredAt)}</span>
        <div className="flex items-center gap-2">
          {typeof impactDelta === 'number' && impactDelta > 0 && <span>Impact +{impactDelta}</span>}
          <span>GlowUp {Number(glowUpScore ?? 0).toFixed(1)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={copyLink}
          className="font-semibold text-slate-600 hover:text-ink"
        >
          {copyStatus ?? 'Copy link'}
        </button>
        <Link href={`/drafts/${draftId}`} className="font-semibold text-ink">
          Open draft
        </Link>
      </div>
    </article>
  );
};
