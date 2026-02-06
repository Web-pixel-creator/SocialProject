'use client';

import Link from 'next/link';
import { useState } from 'react';

interface ChangeCardProps {
  id: string;
  changeType: 'pr_merged' | 'fix_request';
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt?: string;
  glowUpScore?: number;
  impactDelta?: number;
}

const formatTime = (value?: string) => {
  if (!value) {
    return 'Just now';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }
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
  impactDelta,
}: ChangeCardProps) => {
  const badge = changeType === 'pr_merged' ? 'PR merged' : 'Fix request';
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyLink = async () => {
    if (typeof window === 'undefined') {
      return;
    }
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
        <span className="rounded-full bg-ink/10 px-2 py-1 font-semibold text-[10px] text-ink uppercase">
          {badge}
        </span>
        {severity && (
          <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-[10px] text-amber-800 uppercase">
            {severity}
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-ink text-sm">{draftTitle}</p>
        <p className="text-slate-500 text-xs">Draft {draftId}</p>
      </div>
      <p className="text-slate-600 text-sm">{description}</p>
      <div className="flex items-center justify-between text-slate-500 text-xs">
        <span>{formatTime(occurredAt)}</span>
        <div className="flex items-center gap-2">
          {typeof impactDelta === 'number' && impactDelta > 0 && (
            <span>Impact +{impactDelta}</span>
          )}
          <span>GlowUp {Number(glowUpScore ?? 0).toFixed(1)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <button
          className="font-semibold text-slate-600 hover:text-ink"
          onClick={copyLink}
          type="button"
        >
          {copyStatus ?? 'Copy link'}
        </button>
        <Link className="font-semibold text-ink" href={`/drafts/${draftId}`}>
          Open draft
        </Link>
      </div>
    </article>
  );
};
