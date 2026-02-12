'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { BeforeAfterSlider } from '../../../components/BeforeAfterSlider';
import { FixRequestList } from '../../../components/FixRequestList';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { useLastSuccessfulValue } from '../../../lib/useLastSuccessfulValue';

interface ReviewPayload {
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
}

interface FixRequest {
  id: string;
  category: string;
  description: string;
  criticId: string;
}

interface ReviewPageData {
  fixRequests: FixRequest[];
  fixRequestsLoadFailed: boolean;
  review: ReviewPayload | null;
}

interface PullRequestDecisionPayload {
  decision: 'merge' | 'reject' | 'request_changes';
  feedback?: string;
  pullRequestId: string;
  rejectionReason?: string;
}

const fetchReviewData = async (id: string): Promise<ReviewPageData> => {
  const response = await apiClient.get(`/pull-requests/${id}`);
  const review = response.data ?? null;

  apiClient
    .post('/telemetry/ux', {
      draftId: review?.draft?.id,
      eventType: 'pr_review_open',
      prId: review?.pullRequest?.id ?? id,
      source: 'review',
    })
    .catch(() => {
      // ignore telemetry failures
    });

  let fixRequests: FixRequest[] = [];
  let fixRequestsLoadFailed = false;

  if (review?.draft?.id) {
    try {
      const fixRes = await apiClient.get(
        `/drafts/${review.draft.id}/fix-requests`,
      );
      fixRequests = fixRes.data ?? [];
    } catch (_fixRequestError) {
      fixRequestsLoadFailed = true;
      fixRequests = [];
    }
  }

  return {
    fixRequests,
    fixRequestsLoadFailed,
    review,
  };
};

export default function PullRequestReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<ReviewPageData>(
    `pr:review:${params.id}`,
    () => fetchReviewData(params.id),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const review = data?.review ?? null;
  const fixRequests = useLastSuccessfulValue<FixRequest[]>(
    data?.fixRequests,
    data?.fixRequestsLoadFailed === false,
    [],
  );
  const { isMutating: decisionLoading, trigger: triggerDecision } =
    useSWRMutation<void, unknown, string, PullRequestDecisionPayload>(
      'pr:review:decision',
      async (_key, { arg }) => {
        await apiClient.post(`/pull-requests/${arg.pullRequestId}/decide`, {
          decision: arg.decision,
          feedback: arg.feedback,
          rejectionReason: arg.rejectionReason,
        });
      },
    );
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState('');

  let error: string | null = null;
  if (actionError) {
    error = actionError;
  } else if (loadError) {
    error = getApiErrorMessage(loadError, t('pullRequestReview.errors.load'));
  }

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

  const handleDecision = useCallback(
    async (decision: 'merge' | 'reject' | 'request_changes') => {
      if (!review) {
        return;
      }
      if (decision === 'reject' && !rejectReason.trim()) {
        setActionError(t('pullRequestReview.errors.rejectionReasonRequired'));
        return;
      }
      setActionError(null);
      try {
        await triggerDecision(
          {
            decision,
            feedback: feedback || undefined,
            pullRequestId: review.pullRequest.id,
            rejectionReason: decision === 'reject' ? rejectReason : undefined,
          },
          { throwOnError: true },
        );
        if (decision === 'merge' || decision === 'reject') {
          apiClient
            .post('/telemetry/ux', {
              draftId: review.draft.id,
              eventType: decision === 'merge' ? 'pr_merge' : 'pr_reject',
              prId: review.pullRequest.id,
              source: 'review',
            })
            .catch(() => {
              // ignore telemetry failures
            });
        }
        await mutate();
      } catch (error: unknown) {
        setActionError(
          getApiErrorMessage(error, t('pullRequestReview.errors.decision')),
        );
      }
    },
    [feedback, mutate, rejectReason, review, t, triggerDecision],
  );

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
  }, [handleDecision]);

  if (isLoading) {
    return (
      <div className="card p-6 text-muted-foreground text-sm">
        {t('pullRequestReview.states.loading')}
      </div>
    );
  }

  if (!review) {
    return (
      <div className="card p-6 text-muted-foreground text-sm">
        {error ?? t('pullRequestReview.states.notFound')}
      </div>
    );
  }

  const { pullRequest, draft, authorStudio, makerStudio, metrics } = review;
  const statusLabel = (() => {
    if (pullRequest.status === 'pending') {
      return t('pullRequestReview.status.pending');
    }
    if (pullRequest.status === 'merged') {
      return t('pullRequestReview.status.merged');
    }
    if (pullRequest.status === 'rejected') {
      return t('pullRequestReview.status.rejected');
    }
    return t('pullRequestReview.status.changesRequested');
  })();
  const statusTone = (() => {
    if (pullRequest.status === 'pending') {
      return 'tag-hot border';
    }
    if (pullRequest.status === 'merged') {
      return 'tag-success border';
    }
    return 'tag-alert border';
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('pullRequestReview.header.pill')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-2xl text-foreground">
            PR {pullRequest.id}
          </h2>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold text-[10px] uppercase ${statusTone}`}
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {`${makerStudio} -> ${authorStudio}`} |{' '}
          {pullRequest.severity.toUpperCase()}
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <BeforeAfterSlider
            afterImageUrl={review.afterImageUrl}
            afterLabel={`v${pullRequest.proposedVersion ?? 'PR'}`}
            beforeImageUrl={review.beforeImageUrl}
            beforeLabel={`v${draft.currentVersion}`}
          />

          <div className="card p-4">
            <h3 className="font-semibold text-foreground text-sm">
              {t('pullRequestReview.summary.title')}
            </h3>
            <p className="mt-2 text-muted-foreground text-sm">
              {pullRequest.description}
            </p>
          </div>

          <FixRequestList items={fixList} />
        </div>

        <div className="grid gap-6">
          <div className="card p-4 text-muted-foreground text-sm">
            <h3 className="font-semibold text-foreground text-sm">
              {t('pullRequestReview.metrics.title')}
            </h3>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span>{t('pullRequestReview.metrics.currentGlowUp')}</span>
                <span>{metrics.currentGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('pullRequestReview.metrics.predictedGlowUp')}</span>
                <span>{metrics.predictedGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('pullRequestReview.metrics.glowUpDelta')}</span>
                <span>{metrics.glowUpDelta.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('pullRequestReview.metrics.impactDeltaMaker')}</span>
                <span>+{metrics.impactDelta}</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-foreground text-sm">
              {t('pullRequestReview.decision.title')}
            </h3>
            <textarea
              className="mt-3 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={t('pullRequestReview.decision.feedbackPlaceholder')}
              rows={3}
              value={feedback}
            />
            <textarea
              className="mt-3 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t(
                'pullRequestReview.decision.rejectionReasonPlaceholder',
              )}
              rows={3}
              value={rejectReason}
            />
            <div className="mt-4 grid gap-2">
              <button
                className="tag-success rounded-full border px-4 py-2 font-semibold text-xs"
                disabled={decisionLoading}
                onClick={() => handleDecision('merge')}
                type="button"
              >
                {t('pullRequestReview.decision.actions.merge')}
              </button>
              <button
                className="tag-hot rounded-full border px-4 py-2 font-semibold text-xs transition"
                disabled={decisionLoading}
                onClick={() => handleDecision('request_changes')}
                type="button"
              >
                {t('pullRequestReview.decision.actions.requestChanges')}
              </button>
              <button
                className="tag-alert rounded-full border px-4 py-2 font-semibold text-xs"
                disabled={decisionLoading}
                onClick={() => handleDecision('reject')}
                type="button"
              >
                {t('pullRequestReview.decision.actions.reject')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
