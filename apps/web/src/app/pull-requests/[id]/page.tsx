'use client';

import { useEffect, useMemo, useState } from 'react';
import { BeforeAfterSlider } from '../../../components/BeforeAfterSlider';
import { FixRequestList } from '../../../components/FixRequestList';
import { apiClient } from '../../../lib/api';

type ReviewPayload = {
  pullRequest: {
    id: string;
    draftId: string;
    makerId: string;
    proposedVersion: number;
    description: string;
    severity: 'major' | 'minor';
    status: 'pending' | 'merged' | 'rejected' | 'changes_requested';
    addressedFixRequests: string[];
  };
  draft: {
    id: string;
    authorId: string;
    status: 'draft' | 'release';
    currentVersion: number;
    glowUpScore: number;
  };
  authorStudio: string;
  makerStudio: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  metrics: {
    currentGlowUp: number;
    predictedGlowUp: number;
    glowUpDelta: number;
    impactDelta: number;
  };
};

type FixRequest = {
  id: string;
  category: string;
  description: string;
  criticId: string;
};

export default function PullRequestReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [fixRequests, setFixRequests] = useState<FixRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    const response = await apiClient.get(`/pull-requests/${params.id}`);
    setReview(response.data);
    if (response.data?.draft?.id) {
      const fixRes = await apiClient.get(
        `/drafts/${response.data.draft.id}/fix-requests`,
      );
      setFixRequests(fixRes.data ?? []);
    }
    try {
      await apiClient.post('/telemetry/ux', {
        eventType: 'pr_review_open',
        prId: response.data?.pullRequest?.id ?? params.id,
        draftId: response.data?.draft?.id,
        source: 'review',
      });
    } catch (_telemetryError) {
      // ignore telemetry failures
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await load();
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ?? 'Failed to load pull request.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const addressed = useMemo(() => {
    if (!review?.pullRequest?.addressedFixRequests?.length) {
      return fixRequests;
    }
    const set = new Set(review.pullRequest.addressedFixRequests);
    return fixRequests.filter((item) => set.has(item.id));
  }, [review?.pullRequest?.addressedFixRequests, fixRequests]);

  const fixList = addressed.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    critic: `Studio ${item.criticId.slice(0, 6)}`,
  }));

  const handleDecision = async (
    decision: 'merge' | 'reject' | 'request_changes',
  ) => {
    if (!review) return;
    if (decision === 'reject' && !rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setDecisionLoading(true);
    setError(null);
    try {
      await apiClient.post(`/pull-requests/${review.pullRequest.id}/decide`, {
        decision,
        rejectionReason: decision === 'reject' ? rejectReason : undefined,
        feedback: feedback || undefined,
      });
      if (decision === 'merge' || decision === 'reject') {
        try {
          await apiClient.post('/telemetry/ux', {
            eventType: decision === 'merge' ? 'pr_merge' : 'pr_reject',
            prId: review.pullRequest.id,
            draftId: review.draft.id,
            source: 'review',
          });
        } catch (_telemetryError) {
          // ignore telemetry failures
        }
      }
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Decision failed.');
    } finally {
      setDecisionLoading(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        handleDecision('merge');
      }
      if (event.key.toLowerCase() === 'r') {
        handleDecision('reject');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        Loading pull request...
      </div>
    );
  }

  if (!review) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        {error ?? 'Pull request not found.'}
      </div>
    );
  }

  const { pullRequest, draft, authorStudio, makerStudio, metrics } = review;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">PR Review</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">
          PR {pullRequest.id}
        </h2>
        <p className="text-sm text-slate-600">
          {makerStudio} → {authorStudio} · {pullRequest.severity.toUpperCase()}{' '}
          · {pullRequest.status}
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <BeforeAfterSlider
            beforeLabel={`v${draft.currentVersion}`}
            afterLabel={`v${pullRequest.proposedVersion ?? 'PR'}`}
            beforeImageUrl={review.beforeImageUrl}
            afterImageUrl={review.afterImageUrl}
          />

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">PR Summary</h3>
            <p className="mt-2 text-sm text-slate-600">
              {pullRequest.description}
            </p>
          </div>

          <FixRequestList items={fixList} />
        </div>

        <div className="grid gap-6">
          <div className="card p-4 text-sm text-slate-600">
            <h3 className="text-sm font-semibold text-ink">Metrics delta</h3>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span>Current GlowUp</span>
                <span>{metrics.currentGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Predicted GlowUp</span>
                <span>{metrics.predictedGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>GlowUp Δ</span>
                <span>{metrics.glowUpDelta.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Impact Δ (maker)</span>
                <span>+{metrics.impactDelta}</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">Decision</h3>
            <textarea
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={3}
              placeholder="Add feedback (optional)."
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <textarea
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={3}
              placeholder="Rejection reason (required for reject)."
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
            <div className="mt-4 grid gap-2">
              <button
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white"
                onClick={() => handleDecision('merge')}
                disabled={decisionLoading}
                type="button"
              >
                Merge (M)
              </button>
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                onClick={() => handleDecision('request_changes')}
                disabled={decisionLoading}
                type="button"
              >
                Request changes
              </button>
              <button
                className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white"
                onClick={() => handleDecision('reject')}
                disabled={decisionLoading}
                type="button"
              >
                Reject (R)
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
