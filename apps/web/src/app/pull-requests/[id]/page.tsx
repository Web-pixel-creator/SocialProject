'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BeforeAfterSlider } from '../../../components/BeforeAfterSlider';
import { FixRequestList } from '../../../components/FixRequestList';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';

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

export default function PullRequestReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [fixRequests, setFixRequests] = useState<FixRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
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
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await load();
      } catch (error: unknown) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              error,
              t(
                'Failed to load pull request.',
                'Не удалось загрузить пул-реквест.',
              ),
            ),
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
  }, [load, t]);

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
    if (!review) {
      return;
    }
    if (decision === 'reject' && !rejectReason.trim()) {
      setError(
        t('Rejection reason is required.', 'Требуется причина отклонения.'),
      );
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
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(
          error,
          t('Decision failed.', 'Не удалось принять решение.'),
        ),
      );
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
      <div className="card p-6 text-slate-500 text-sm">
        {t('Loading pull request...', 'Загрузка пул-реквеста...')}
      </div>
    );
  }

  if (!review) {
    return (
      <div className="card p-6 text-slate-500 text-sm">
        {error ?? t('Pull request not found.', 'Пул-реквест не найден.')}
      </div>
    );
  }

  const { pullRequest, draft, authorStudio, makerStudio, metrics } = review;
  const statusLabel = (() => {
    if (pullRequest.status === 'pending') {
      return t('pending', 'в ожидании');
    }
    if (pullRequest.status === 'merged') {
      return t('merged', 'смержен');
    }
    if (pullRequest.status === 'rejected') {
      return t('rejected', 'отклонен');
    }
    return t('changes requested', 'нужны доработки');
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('PR Review', 'Ревью PR')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-ink">
          PR {pullRequest.id}
        </h2>
        <p className="text-slate-600 text-sm">
          {`${makerStudio} → ${authorStudio}`} |{' '}
          {pullRequest.severity.toUpperCase()}
          {' | '}
          {statusLabel}
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
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
            <h3 className="font-semibold text-ink text-sm">
              {t('PR Summary', 'Сводка PR')}
            </h3>
            <p className="mt-2 text-slate-600 text-sm">
              {pullRequest.description}
            </p>
          </div>

          <FixRequestList items={fixList} />
        </div>

        <div className="grid gap-6">
          <div className="card p-4 text-slate-600 text-sm">
            <h3 className="font-semibold text-ink text-sm">
              {t('Metrics delta', 'Изменение метрик')}
            </h3>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span>{t('Current GlowUp', 'Текущий GlowUp')}</span>
                <span>{metrics.currentGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('Predicted GlowUp', 'Прогнозируемый GlowUp')}</span>
                <span>{metrics.predictedGlowUp.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('GlowUp delta', 'Изменение GlowUp')}</span>
                <span>{metrics.glowUpDelta.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>
                  {t('Impact delta (maker)', 'Изменение impact (автор)')}
                </span>
                <span>+{metrics.impactDelta}</span>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-ink text-sm">
              {t('Decision', 'Решение')}
            </h3>
            <textarea
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={t(
                'Add feedback (optional).',
                'Добавьте комментарий (опционально).',
              )}
              rows={3}
              value={feedback}
            />
            <textarea
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t(
                'Rejection reason (required for reject).',
                'Причина отклонения (обязательно для reject).',
              )}
              rows={3}
              value={rejectReason}
            />
            <div className="mt-4 grid gap-2">
              <button
                className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-white text-xs"
                disabled={decisionLoading}
                onClick={() => handleDecision('merge')}
                type="button"
              >
                {t('Merge (M)', 'Смержить (M)')}
              </button>
              <button
                className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-600 text-xs"
                disabled={decisionLoading}
                onClick={() => handleDecision('request_changes')}
                type="button"
              >
                {t('Request changes', 'Запросить доработки')}
              </button>
              <button
                className="rounded-full bg-rose-500 px-4 py-2 font-semibold text-white text-xs"
                disabled={decisionLoading}
                onClick={() => handleDecision('reject')}
                type="button"
              >
                {t('Reject (R)', 'Отклонить (R)')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
