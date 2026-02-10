'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { BeforeAfterSlider } from '../../../components/BeforeAfterSlider';
import {
  DraftArcCard,
  type DraftArcSummaryView,
} from '../../../components/DraftArcCard';
import {
  type DraftRecap24hView,
  DraftRecapPanel,
} from '../../../components/DraftRecapPanel';
import { FixRequestList } from '../../../components/FixRequestList';
import {
  type ObserverDigestEntryView,
  ObserverDigestPanel,
} from '../../../components/ObserverDigestPanel';
import {
  PredictionWidget,
  type PullRequestPredictionSummaryView,
} from '../../../components/PredictionWidget';
import { PullRequestList } from '../../../components/PullRequestList';
import { VersionTimeline } from '../../../components/VersionTimeline';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useRealtimeRoom } from '../../../hooks/useRealtimeRoom';
import { apiClient } from '../../../lib/api';
import { SEARCH_DEFAULT_PROFILE } from '../../../lib/config';
import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiErrorStatus,
} from '../../../lib/errors';

const HeatMapOverlay = dynamic(
  () =>
    import('../../../components/HeatMapOverlay').then(
      (mod) => mod.HeatMapOverlay,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="card p-4 text-muted-foreground text-sm">
        Loading heat map...
      </div>
    ),
  },
);
const LivePanel = dynamic(
  () => import('../../../components/LivePanel').then((mod) => mod.LivePanel),
  {
    ssr: false,
    loading: () => (
      <div className="card p-4 text-muted-foreground text-sm">
        Loading live panel...
      </div>
    ),
  },
);

interface Draft {
  id: string;
  currentVersion: number;
  glowUpScore: number;
  status: string;
  updatedAt: string;
}

interface Version {
  versionNumber: number;
  imageUrl: string;
}

interface FixRequest {
  id: string;
  category: string;
  description: string;
  criticId: string;
}

interface PullRequest {
  id: string;
  status: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  description: string;
  makerId: string;
}

interface DraftArcView {
  summary: DraftArcSummaryView;
  recap24h: DraftRecap24hView;
}

interface SimilarDraft {
  id: string;
  title: string;
  score: number;
  glowUpScore: number;
  type: 'draft' | 'release';
}

interface DraftPayload {
  draft: Draft | null;
  versions: Version[];
}

const fetchDraftPayload = async (draftId: string): Promise<DraftPayload> => {
  const response = await apiClient.get(`/drafts/${draftId}`);
  return {
    draft: response.data?.draft ?? null,
    versions: response.data?.versions ?? [],
  };
};

const fetchFixRequests = async (draftId: string): Promise<FixRequest[]> => {
  const response = await apiClient.get(`/drafts/${draftId}/fix-requests`);
  return response.data ?? [];
};

const fetchPullRequests = async (draftId: string): Promise<PullRequest[]> => {
  const response = await apiClient.get(`/drafts/${draftId}/pull-requests`);
  return response.data ?? [];
};

const sendTelemetry = async (payload: Record<string, unknown>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

const isAuthRequiredError = (error: unknown) => {
  const status = getApiErrorStatus(error);
  return status === 401 || status === 403;
};

const isWatchlistEntryForDraft = (item: unknown, draftId: string): boolean => {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const entry = item as { draftId?: unknown; draft_id?: unknown };
  return entry.draftId === draftId || entry.draft_id === draftId;
};

export default function DraftDetailPage() {
  const { t } = useLanguage();
  const params = useParams<{ id?: string | string[] }>();
  const rawId = params?.id;
  const resolvedId = Array.isArray(rawId) ? rawId[0] : rawId;
  const draftId = resolvedId && resolvedId !== 'undefined' ? resolvedId : '';
  const {
    data: draftPayload,
    error: draftLoadError,
    isLoading: draftLoading,
    mutate: mutateDraft,
  } = useSWR<DraftPayload>(
    draftId ? `draft:detail:${draftId}` : null,
    () => fetchDraftPayload(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: fixRequests = [],
    error: fixRequestsLoadError,
    isLoading: fixRequestsLoading,
    mutate: mutateFixRequests,
  } = useSWR<FixRequest[]>(
    draftId ? `draft:fix-requests:${draftId}` : null,
    () => fetchFixRequests(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: pullRequests = [],
    error: pullRequestsLoadError,
    isLoading: pullRequestsLoading,
    mutate: mutatePullRequests,
  } = useSWR<PullRequest[]>(
    draftId ? `draft:pull-requests:${draftId}` : null,
    () => fetchPullRequests(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const draft = draftPayload?.draft ?? null;
  const versions = draftPayload?.versions ?? [];
  const [similarDrafts, setSimilarDrafts] = useState<SimilarDraft[]>([]);
  const [similarStatus, setSimilarStatus] = useState<string | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [arcView, setArcView] = useState<DraftArcView | null>(null);
  const [arcLoading, setArcLoading] = useState(false);
  const [arcError, setArcError] = useState<string | null>(null);
  const [digestEntries, setDigestEntries] = useState<ObserverDigestEntryView[]>(
    [],
  );
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [observerAuthRequired, setObserverAuthRequired] = useState(false);
  const [predictionSummary, setPredictionSummary] =
    useState<PullRequestPredictionSummaryView | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionSubmitLoading, setPredictionSubmitLoading] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; time: string }>
  >([]);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const loading = draftLoading || fixRequestsLoading || pullRequestsLoading;
  let error: string | null = null;
  if (draftLoadError) {
    error = getApiErrorMessage(
      draftLoadError,
      t('draftDetail.errors.loadDraft'),
    );
  } else if (fixRequestsLoadError) {
    error = getApiErrorMessage(
      fixRequestsLoadError,
      t('draftDetail.errors.loadDraft'),
    );
  } else if (pullRequestsLoadError) {
    error = getApiErrorMessage(
      pullRequestsLoadError,
      t('draftDetail.errors.loadDraft'),
    );
  }

  const { events } = useRealtimeRoom(
    draftId ? `post:${draftId}` : 'post:unknown',
  );

  const loadArc = useCallback(async () => {
    if (!draftId) {
      return;
    }
    setArcLoading(true);
    setArcError(null);
    try {
      const response = await apiClient.get(`/drafts/${draftId}/arc`);
      const payload = response.data;
      if (
        payload &&
        typeof payload === 'object' &&
        payload.summary &&
        typeof payload.summary === 'object' &&
        payload.recap24h &&
        typeof payload.recap24h === 'object'
      ) {
        setArcView(payload);
      } else {
        setArcView(null);
      }
    } catch (error: unknown) {
      setArcView(null);
      setArcError(getApiErrorMessage(error, t('draftDetail.errors.loadArc')));
    } finally {
      setArcLoading(false);
    }
  }, [draftId, t]);

  const loadWatchlist = useCallback(async () => {
    if (!draftId) {
      return;
    }
    try {
      const response = await apiClient.get('/observers/watchlist');
      const list = Array.isArray(response.data) ? response.data : [];
      setObserverAuthRequired(false);
      setIsFollowed(
        list.some((item) => isWatchlistEntryForDraft(item, draftId)),
      );
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setObserverAuthRequired(true);
        setIsFollowed(false);
        return;
      }
      setIsFollowed(false);
    }
  }, [draftId]);

  const loadDigest = useCallback(async () => {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const response = await apiClient.get('/observers/digest', {
        params: { unseenOnly: false, limit: 8 },
      });
      setObserverAuthRequired(false);
      setDigestEntries(Array.isArray(response.data) ? response.data : []);
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setObserverAuthRequired(true);
        setDigestEntries([]);
      } else {
        setDigestError(
          getApiErrorMessage(error, t('draftDetail.errors.loadDigest')),
        );
        setDigestEntries([]);
      }
    } finally {
      setDigestLoading(false);
    }
  }, [t]);

  const loadPredictionSummary = useCallback(
    async (pullRequestId: string) => {
      setPredictionLoading(true);
      setPredictionError(null);
      try {
        const response = await apiClient.get(
          `/pull-requests/${pullRequestId}/predictions`,
        );
        setObserverAuthRequired(false);
        const payload = response.data;
        if (
          payload &&
          typeof payload === 'object' &&
          typeof payload.pullRequestId === 'string'
        ) {
          setPredictionSummary(payload);
        } else {
          setPredictionSummary(null);
        }
      } catch (error: unknown) {
        if (isAuthRequiredError(error)) {
          setObserverAuthRequired(true);
          setPredictionSummary(null);
        } else {
          setPredictionError(
            getApiErrorMessage(
              error,
              t('draftDetail.errors.loadPredictionSummary'),
            ),
          );
          setPredictionSummary(null);
        }
      } finally {
        setPredictionLoading(false);
      }
    },
    [t],
  );

  const runDemoFlow = useCallback(async () => {
    if (!draftId) {
      return;
    }
    setDemoLoading(true);
    setDemoStatus(null);
    try {
      await apiClient.post('/demo/flow', { draftId });
      setDemoStatus(t('draftDetail.status.demoFlowComplete'));
      await Promise.all([
        mutateDraft(),
        mutateFixRequests(),
        mutatePullRequests(),
      ]);
    } catch (error: unknown) {
      setDemoStatus(
        getApiErrorMessage(error, t('draftDetail.errors.runDemoFlow')),
      );
    } finally {
      setDemoLoading(false);
    }
  }, [draftId, mutateDraft, mutateFixRequests, mutatePullRequests, t]);

  const copyDraftId = async () => {
    if (!draftId || typeof navigator === 'undefined') {
      return;
    }
    try {
      await navigator.clipboard.writeText(draftId);
      setCopyStatus(t('draftDetail.copy.copied'));
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (_error) {
      setCopyStatus(t('draftDetail.copy.failed'));
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const loadSimilarDrafts = useCallback(async () => {
    if (!draftId) {
      setSimilarDrafts([]);
      setSimilarStatus(t('draftDetail.errors.missingDraftId'));
      return;
    }
    setSimilarLoading(true);
    setSimilarStatus(null);
    const telemetryBase = { mode: 'visual', profile: SEARCH_DEFAULT_PROFILE };
    try {
      const response = await apiClient.get('/search/similar', {
        params: { draftId, limit: 6 },
      });
      const items = response.data ?? [];
      setSimilarDrafts(items);
      if (items.length === 0) {
        setSimilarStatus(t('draftDetail.similar.noResults'));
        sendTelemetry({
          eventType: 'similar_search_empty',
          draftId,
          source: 'draft_detail',
          metadata: { ...telemetryBase, reason: 'no_results' },
        });
      } else {
        sendTelemetry({
          eventType: 'similar_search_shown',
          draftId,
          source: 'draft_detail',
          metadata: { ...telemetryBase, count: items.length },
        });
      }
    } catch (error: unknown) {
      const code = getApiErrorCode(error);
      const reason = code ?? 'error';
      if (code === 'EMBEDDING_NOT_FOUND') {
        setSimilarStatus(t('draftDetail.similar.availableAfterAnalysis'));
      } else if (code === 'DRAFT_NOT_FOUND') {
        setSimilarStatus(t('draftDetail.errors.draftNotFound'));
      } else {
        setSimilarStatus(
          getApiErrorMessage(error, t('draftDetail.errors.loadSimilar')),
        );
      }
      setSimilarDrafts([]);
      sendTelemetry({
        eventType: 'similar_search_empty',
        draftId,
        source: 'draft_detail',
        metadata: { ...telemetryBase, reason },
      });
    } finally {
      setSimilarLoading(false);
    }
  }, [draftId, t]);

  useEffect(() => {
    if (!draftId) {
      return;
    }
    loadArc();
    loadWatchlist();
    loadDigest();
  }, [draftId, loadArc, loadDigest, loadWatchlist]);

  const markDigestSeen = async (entryId: string) => {
    try {
      await apiClient.post(`/observers/digest/${entryId}/seen`);
      setDigestEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, isSeen: true } : entry,
        ),
      );
      sendTelemetry({
        eventType: 'digest_open',
        draftId,
        source: 'draft_detail',
      });
    } catch {
      // noop: keep item visible if server mark-seen fails
    }
  };

  const toggleFollow = async () => {
    if (!draftId) {
      return;
    }
    try {
      if (isFollowed) {
        await apiClient.delete(`/observers/watchlist/${draftId}`);
      } else {
        await apiClient.post(`/observers/watchlist/${draftId}`);
      }
      const nextState = !isFollowed;
      setObserverAuthRequired(false);
      setIsFollowed(nextState);
      sendTelemetry({
        eventType: nextState ? 'watchlist_follow' : 'watchlist_unfollow',
        draftId,
        source: 'draft_detail',
      });
      if (nextState) {
        loadDigest();
      }
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setObserverAuthRequired(true);
      }
    }
  };

  const submitPrediction = async (outcome: 'merge' | 'reject') => {
    const pendingPull = pullRequests.find((item) => item.status === 'pending');
    if (!pendingPull) {
      return;
    }
    setPredictionSubmitLoading(true);
    setPredictionError(null);
    try {
      await apiClient.post(`/pull-requests/${pendingPull.id}/predict`, {
        predictedOutcome: outcome,
      });
      sendTelemetry({
        eventType: 'pr_prediction_submit',
        draftId,
        source: 'draft_detail',
        metadata: { outcome },
      });
      await loadPredictionSummary(pendingPull.id);
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setObserverAuthRequired(true);
      } else {
        setPredictionError(
          getApiErrorMessage(error, t('draftDetail.errors.submitPrediction')),
        );
      }
    } finally {
      setPredictionSubmitLoading(false);
    }
  };

  useEffect(() => {
    loadSimilarDrafts();
  }, [loadSimilarDrafts]);

  useEffect(() => {
    if (!(arcView?.summary && arcView?.recap24h)) {
      return;
    }
    sendTelemetry({
      eventType: 'draft_arc_view',
      draftId,
      source: 'draft_detail',
      metadata: { state: arcView.summary.state },
    });
    sendTelemetry({
      eventType: 'draft_recap_view',
      draftId,
      source: 'draft_detail',
      metadata: { hasChanges: arcView.recap24h.hasChanges },
    });
  }, [arcView, draftId]);

  useEffect(() => {
    if (events.length === 0) {
      return;
    }
    const last = events.at(-1);
    if (!last) {
      return;
    }
    if (
      ['fix_request', 'pull_request', 'pull_request_decision'].includes(
        last.type,
      )
    ) {
      mutateFixRequests();
      mutatePullRequests();
      loadArc();
      if (isFollowed) {
        loadDigest();
      }
    }
    if (last.type === 'glowup_update') {
      mutateDraft();
      loadArc();
    }
  }, [
    events,
    isFollowed,
    loadArc,
    loadDigest,
    mutateDraft,
    mutateFixRequests,
    mutatePullRequests,
  ]);

  useEffect(() => {
    const pendingPull = pullRequests.find((item) => item.status === 'pending');
    if (!pendingPull) {
      setPredictionSummary(null);
      setPredictionError(null);
      return;
    }
    loadPredictionSummary(pendingPull.id);
  }, [pullRequests, loadPredictionSummary]);

  const formatEventMessage = useCallback(
    (eventType: string, payload: Record<string, unknown>) => {
      if (eventType === 'fix_request') {
        return t('draftDetail.events.newFixRequest');
      }
      if (eventType === 'pull_request') {
        return t('draftDetail.events.newPullRequest');
      }
      if (eventType === 'pull_request_decision') {
        const decision = String(payload?.decision ?? 'updated').replace(
          '_',
          ' ',
        );
        return `${t('draftDetail.events.pullRequest')} ${decision}`;
      }
      if (eventType === 'glowup_update') {
        return t('draftDetail.events.glowUpUpdated');
      }
      if (eventType === 'draft_released') {
        return t('draftDetail.events.draftReleased');
      }
      return t('draftDetail.events.draftActivityUpdated');
    },
    [t],
  );

  useEffect(() => {
    if (!isFollowed || events.length === 0) {
      return;
    }
    const fresh = events.filter(
      (event) => !seenEventsRef.current.has(event.id),
    );
    if (fresh.length === 0) {
      return;
    }
    const now = new Date().toLocaleTimeString();
    const next = fresh.map((event) => {
      seenEventsRef.current.add(event.id);
      return {
        id: event.id,
        message: formatEventMessage(event.type, event.payload),
        time: now,
      };
    });
    setNotifications((prev) => [...next, ...prev].slice(0, 5));
  }, [events, formatEventMessage, isFollowed]);

  const versionNumbers = useMemo(
    () => versions.map((version) => version.versionNumber),
    [versions],
  );
  const beforeLabel =
    versionNumbers.length > 0 ? `v${versionNumbers[0]}` : 'v1';
  const afterLabel =
    versionNumbers.length > 0 ? `v${versionNumbers.at(-1)}` : 'v1';
  const beforeImageUrl = versions.length > 0 ? versions[0].imageUrl : undefined;
  const afterImageUrl = versions.at(-1)?.imageUrl;

  const fixList = fixRequests.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    critic: `Studio ${item.criticId.slice(0, 6)}`,
  }));

  const prList = pullRequests.map((item) => ({
    id: item.id,
    status: item.status,
    description: item.description,
    maker: `Studio ${item.makerId.slice(0, 6)}`,
  }));

  const pendingPull = pullRequests.find((item) => item.status === 'pending');
  const hasFixRequests = fixRequests.length > 0;
  const statusInfo = (() => {
    if (pendingPull) {
      return {
        label: t('draftDetail.status.readyForReview'),
        tone: 'bg-amber-100 text-amber-800',
      };
    }
    if (hasFixRequests) {
      return {
        label: t('draftDetail.status.seekingPr'),
        tone: 'bg-muted/70 text-foreground',
      };
    }
    return {
      label: t('draftDetail.status.needsHelp'),
      tone: 'bg-rose-500/15 text-rose-500',
    };
  })();

  const nextAction = (() => {
    if (!draftId) {
      return null;
    }
    if (pendingPull) {
      return {
        title: t('draftDetail.nextAction.reviewPendingPr.title'),
        description: t('draftDetail.nextAction.reviewPendingPr.description'),
        ctaLabel: t('draftDetail.nextAction.reviewPendingPr.cta'),
        href: `/pull-requests/${pendingPull.id}`,
      };
    }
    if (hasFixRequests) {
      return {
        title: t('draftDetail.nextAction.shareForPr.title'),
        description: t('draftDetail.nextAction.shareForPr.description'),
        ctaLabel: copyStatus ?? t('draftDetail.nextAction.shareForPr.cta'),
        onClick: copyDraftId,
      };
    }
    return {
      title: t('draftDetail.nextAction.startCritique.title'),
      description: t('draftDetail.nextAction.startCritique.description'),
      ctaLabel: demoLoading
        ? t('draftDetail.actions.runningDemo')
        : t('draftDetail.actions.runDemoFlow'),
      onClick: runDemoFlow,
    };
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('draftDetail.header.pill')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-2xl text-foreground">
            {draftId ? `${t('common.draft')} ${draftId}` : t('common.draft')}
          </h2>
          {draft && (
            <span
              className={`rounded-full px-3 py-1 font-semibold text-xs ${statusInfo.tone}`}
            >
              {statusInfo.label}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {t('draftDetail.header.subtitle')}{' '}
          {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 disabled:opacity-60"
            disabled={demoLoading || !draftId}
            onClick={runDemoFlow}
            type="button"
          >
            {demoLoading
              ? t('draftDetail.actions.runningDemo')
              : t('draftDetail.actions.runDemoFlow')}
          </button>
          {demoStatus && (
            <span className="text-muted-foreground text-xs">{demoStatus}</span>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-6 text-muted-foreground text-sm">
          {t('draftDetail.loadingDraft')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            {nextAction && (
              <div className="card p-4">
                <p className="pill">{t('draftDetail.nextAction.pill')}</p>
                <h3 className="mt-3 font-semibold text-foreground text-lg">
                  {nextAction.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {nextAction.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {'href' in nextAction ? (
                    <Link
                      className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90"
                      href={nextAction.href as string}
                    >
                      {nextAction.ctaLabel}
                    </Link>
                  ) : (
                    <button
                      className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 disabled:opacity-60"
                      disabled={demoLoading && !hasFixRequests}
                      onClick={nextAction.onClick}
                      type="button"
                    >
                      {nextAction.ctaLabel}
                    </button>
                  )}
                  {copyStatus && (
                    <span className="text-muted-foreground text-xs">
                      {copyStatus}
                    </span>
                  )}
                </div>
              </div>
            )}
            <DraftArcCard
              error={arcError}
              loading={arcLoading}
              summary={arcView?.summary ?? null}
            />
            <DraftRecapPanel
              error={arcError}
              loading={arcLoading}
              recap={arcView?.recap24h ?? null}
            />
            <VersionTimeline
              versions={versionNumbers.length > 0 ? versionNumbers : [1]}
            />
            <BeforeAfterSlider
              afterImageUrl={afterImageUrl}
              afterLabel={afterLabel}
              beforeImageUrl={beforeImageUrl}
              beforeLabel={beforeLabel}
            />
            <div id="fix-requests">
              <FixRequestList items={fixList} />
            </div>
            <div id="pull-requests">
              <PullRequestList items={prList} />
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">
                  {t('draftDetail.similar.title')}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {t('draftDetail.similar.visualMatch')}
                </span>
              </div>
              {similarLoading && (
                <p className="mt-3 text-muted-foreground text-xs">
                  {t('draftDetail.similar.loading')}
                </p>
              )}
              {!similarLoading && similarStatus && (
                <p className="mt-3 text-muted-foreground text-xs">
                  {similarStatus}
                </p>
              )}
              {!(similarLoading || similarStatus) && (
                <ul className="mt-3 grid gap-2">
                  {similarDrafts.map((item) => (
                    <li
                      className="rounded-lg border border-border bg-background/70 p-3 text-xs"
                      key={item.id}
                    >
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {item.type}
                      </p>
                      <p className="text-foreground text-sm">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('draftDetail.similar.similarity')}{' '}
                        {Number(item.score ?? 0).toFixed(2)} | GlowUp{' '}
                        {Number(item.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Link
                  className="inline-flex items-center rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-xs hover:border-border/70"
                  href={
                    draftId
                      ? `/search?mode=visual&draftId=${draftId}&type=draft&from=similar`
                      : '/search?mode=visual&type=draft'
                  }
                  onClick={() =>
                    sendTelemetry({
                      eventType: 'similar_search_clicked',
                      draftId,
                      source: 'draft_detail',
                      metadata: {
                        mode: 'visual',
                        profile: SEARCH_DEFAULT_PROFILE,
                      },
                    })
                  }
                  scroll={false}
                >
                  {t('draftDetail.similar.seeMore')}
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-6">
            <HeatMapOverlay />
            <PredictionWidget
              authRequired={observerAuthRequired}
              error={predictionError}
              loading={predictionLoading}
              onPredict={submitPrediction}
              submitLoading={predictionSubmitLoading}
              summary={predictionSummary}
            />
            <div className="card p-4">
              <p className="pill">{t('draftDetail.follow.pill')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('draftDetail.follow.title')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {t('draftDetail.follow.description')}
              </p>
              {observerAuthRequired && (
                <p className="mt-2 text-muted-foreground text-xs">
                  {t('draftDetail.follow.authRequired')}
                </p>
              )}
              <div className="mt-4">
                <button
                  className={`rounded-full px-4 py-2 font-semibold text-xs ${
                    isFollowed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-primary text-primary-foreground'
                  }`}
                  onClick={toggleFollow}
                  type="button"
                >
                  {isFollowed
                    ? t('draftDetail.follow.following')
                    : t('draftDetail.follow.follow')}
                </button>
              </div>
            </div>
            <ObserverDigestPanel
              authRequired={observerAuthRequired}
              entries={digestEntries}
              error={digestError}
              loading={digestLoading}
              onMarkSeen={markDigestSeen}
            />
            <div className="card p-4">
              <p className="pill">{t('draftDetail.activity.pill')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('draftDetail.activity.title')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {isFollowed
                  ? t('draftDetail.activity.descriptionFollowing')
                  : t('draftDetail.activity.descriptionNotFollowing')}
              </p>
              <div className="mt-4 grid gap-2 text-muted-foreground text-xs">
                {notifications.length === 0 ? (
                  <span>{t('draftDetail.activity.empty')}</span>
                ) : (
                  notifications.map((note) => (
                    <div
                      className="rounded-lg border border-border bg-background/70 p-2"
                      key={note.id}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">{note.message}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {note.time}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <LivePanel scope={`post:${draftId || 'unknown'}`} />
          </div>
        </div>
      )}
    </main>
  );
}
