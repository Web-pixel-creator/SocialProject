'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
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
import { useLastSuccessfulValue } from '../../../lib/useLastSuccessfulValue';

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

interface DemoFlowPayload {
  draftId: string;
}

interface PredictionSubmitPayload {
  pullRequestId: string;
  outcome: 'merge' | 'reject';
}

type NextAction =
  | {
      title: string;
      description: string;
      ctaLabel: string;
      href: string;
    }
  | {
      title: string;
      description: string;
      ctaLabel: string;
      onClick: () => void;
    };

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

const fetchDraftArc = async (draftId: string): Promise<DraftArcView | null> => {
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
    return payload as DraftArcView;
  }
  return null;
};

const fetchObserverWatchlist = async (): Promise<unknown[]> => {
  const response = await apiClient.get('/observers/watchlist');
  return Array.isArray(response.data) ? response.data : [];
};

const fetchObserverDigest = async (): Promise<ObserverDigestEntryView[]> => {
  const response = await apiClient.get('/observers/digest', {
    params: { unseenOnly: false, limit: 8 },
  });
  return Array.isArray(response.data) ? response.data : [];
};

const fetchPredictionSummary = async (
  pullRequestId: string,
): Promise<PullRequestPredictionSummaryView | null> => {
  const response = await apiClient.get(
    `/pull-requests/${pullRequestId}/predictions`,
  );
  const payload = response.data;
  if (
    payload &&
    typeof payload === 'object' &&
    typeof payload.pullRequestId === 'string'
  ) {
    return payload as PullRequestPredictionSummaryView;
  }
  return null;
};

const fetchSimilarDrafts = async (draftId: string): Promise<SimilarDraft[]> => {
  const response = await apiClient.get('/search/similar', {
    params: { draftId, limit: 6 },
  });
  return response.data ?? [];
};

const sendTelemetry = (payload: Record<string, unknown>): void => {
  apiClient.post('/telemetry/ux', payload).catch(() => {
    // ignore telemetry failures
  });
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

type Translate = (key: string) => string;

const getPrimaryDraftError = (
  draftLoadError: unknown,
  t: Translate,
): string | null => {
  if (draftLoadError) {
    return getApiErrorMessage(
      draftLoadError,
      t('draftDetail.errors.loadDraft'),
    );
  }
  return null;
};

const getSimilarStatus = ({
  draftId,
  similarDrafts,
  similarDraftsError,
  similarLoading,
  t,
}: {
  draftId: string;
  similarDrafts: SimilarDraft[];
  similarDraftsError: unknown;
  similarLoading: boolean;
  t: Translate;
}): string | null => {
  if (!draftId) {
    return t('draftDetail.errors.missingDraftId');
  }
  if (similarDraftsError) {
    const code = getApiErrorCode(similarDraftsError);
    if (code === 'EMBEDDING_NOT_FOUND') {
      return t('draftDetail.similar.availableAfterAnalysis');
    }
    if (code === 'DRAFT_NOT_FOUND') {
      return t('draftDetail.errors.draftNotFound');
    }
    return getApiErrorMessage(
      similarDraftsError,
      t('draftDetail.errors.loadSimilar'),
    );
  }
  if (!similarLoading && similarDrafts.length === 0) {
    return t('draftDetail.similar.noResults');
  }
  return null;
};

const getPredictionError = ({
  predictionAuthRequired,
  predictionLoadError,
  predictionSubmitError,
  t,
}: {
  predictionAuthRequired: boolean;
  predictionLoadError: unknown;
  predictionSubmitError: string | null;
  t: Translate;
}): string | null => {
  if (predictionSubmitError) {
    return predictionSubmitError;
  }
  if (predictionLoadError && !predictionAuthRequired) {
    return getApiErrorMessage(
      predictionLoadError,
      t('draftDetail.errors.loadPredictionSummary'),
    );
  }
  return null;
};

const getDigestError = ({
  digestAuthRequired,
  digestLoadError,
  t,
}: {
  digestAuthRequired: boolean;
  digestLoadError: unknown;
  t: Translate;
}): string | null =>
  digestLoadError && !digestAuthRequired
    ? getApiErrorMessage(digestLoadError, t('draftDetail.errors.loadDigest'))
    : null;

const getArcError = ({
  arcLoadError,
  t,
}: {
  arcLoadError: unknown;
  t: Translate;
}): string | null =>
  arcLoadError
    ? getApiErrorMessage(arcLoadError, t('draftDetail.errors.loadArc'))
    : null;

const getDraftStatusInfo = (
  hasFixRequests: boolean,
  hasPendingPull: boolean,
  t: Translate,
) => {
  if (hasPendingPull) {
    return {
      label: t('draftDetail.status.readyForReview'),
      tone: 'tag-hot border',
    };
  }
  if (hasFixRequests) {
    return {
      label: t('draftDetail.status.seekingPr'),
      tone: 'border border-border/25 bg-muted/60 text-foreground',
    };
  }
  return {
    label: t('draftDetail.status.needsHelp'),
    tone: 'tag-alert border',
  };
};

const useTimeoutRefCleanup = (timeoutRef: { current: number | null }) => {
  useEffect(
    () => () => {
      if (timeoutRef.current === null) {
        return;
      }
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    },
    [timeoutRef],
  );
};

const formatDraftEventMessage = (
  eventType: string,
  payload: Record<string, unknown>,
  t: Translate,
): string => {
  if (eventType === 'fix_request') {
    return t('draftDetail.events.newFixRequest');
  }
  if (eventType === 'pull_request') {
    return t('draftDetail.events.newPullRequest');
  }
  if (eventType === 'pull_request_decision') {
    const decision = String(payload.decision ?? 'updated').replace('_', ' ');
    return `${t('draftDetail.events.pullRequest')} ${decision}`;
  }
  if (eventType === 'glowup_update') {
    return t('draftDetail.events.glowUpUpdated');
  }
  if (eventType === 'draft_released') {
    return t('draftDetail.events.draftReleased');
  }
  return t('draftDetail.events.draftActivityUpdated');
};

const getNextAction = ({
  draftId,
  pendingPull,
  hasFixRequests,
  copyStatus,
  demoLoading,
  copyDraftId,
  runDemoFlow,
  t,
}: {
  draftId: string;
  pendingPull: PullRequest | undefined;
  hasFixRequests: boolean;
  copyStatus: string | null;
  demoLoading: boolean;
  copyDraftId: () => void;
  runDemoFlow: () => void;
  t: Translate;
}): NextAction | null => {
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
};

const getSimilarTelemetryPayload = ({
  draftId,
  similarDrafts,
  similarDraftsError,
}: {
  draftId: string;
  similarDrafts: SimilarDraft[];
  similarDraftsError: unknown;
}): {
  signature: string;
  eventType: 'similar_search_empty' | 'similar_search_shown';
  metadata: Record<string, string | number>;
} | null => {
  if (similarDraftsError) {
    const reason = getApiErrorCode(similarDraftsError) ?? 'error';
    return {
      signature: `${draftId}:error:${reason}`,
      eventType: 'similar_search_empty',
      metadata: { reason },
    };
  }
  if (similarDrafts.length === 0) {
    return {
      signature: `${draftId}:empty:no_results`,
      eventType: 'similar_search_empty',
      metadata: { reason: 'no_results' },
    };
  }
  return {
    signature: `${draftId}:shown:${similarDrafts.length}`,
    eventType: 'similar_search_shown',
    metadata: { count: similarDrafts.length },
  };
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
    data: fixRequestsData,
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
    data: pullRequestsData,
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
  const fixRequests = useLastSuccessfulValue<FixRequest[]>(
    fixRequestsData,
    Array.isArray(fixRequestsData),
    [],
  );
  const pullRequests = useLastSuccessfulValue<PullRequest[]>(
    pullRequestsData,
    Array.isArray(pullRequestsData),
    [],
  );
  const pendingPull = useMemo(
    () => pullRequests.find((item) => item.status === 'pending'),
    [pullRequests],
  );
  const pendingPullId = pendingPull?.id ?? '';
  const {
    data: arcView,
    error: arcLoadError,
    isLoading: arcIsLoading,
    isValidating: arcIsValidating,
    mutate: mutateArc,
  } = useSWR<DraftArcView | null>(
    draftId ? `draft:arc:${draftId}` : null,
    () => fetchDraftArc(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: watchlistEntries = [],
    error: watchlistLoadError,
    mutate: mutateWatchlist,
  } = useSWR<unknown[]>(
    draftId ? 'observer:watchlist' : null,
    fetchObserverWatchlist,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: digestEntriesData = [],
    error: digestLoadError,
    isLoading: digestIsLoading,
    isValidating: digestIsValidating,
    mutate: mutateDigest,
  } = useSWR<ObserverDigestEntryView[]>(
    draftId ? 'observer:digest' : null,
    fetchObserverDigest,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: predictionSummaryData,
    error: predictionLoadError,
    isLoading: predictionSummaryIsLoading,
    isValidating: predictionSummaryIsValidating,
    mutate: mutatePredictionSummary,
  } = useSWR<PullRequestPredictionSummaryView | null>(
    pendingPullId ? `pull-request:predictions:${pendingPullId}` : null,
    () => fetchPredictionSummary(pendingPullId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: similarDraftsData = [],
    error: similarDraftsError,
    isLoading: similarDraftsIsLoading,
    isValidating: similarDraftsIsValidating,
  } = useSWR<SimilarDraft[]>(
    draftId ? `draft:similar:${draftId}` : null,
    () => fetchSimilarDrafts(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const [predictionSubmitError, setPredictionSubmitError] = useState<
    string | null
  >(null);
  const [manualObserverAuthRequired, setManualObserverAuthRequired] =
    useState(false);
  const [followInFlight, setFollowInFlight] = useState(false);
  const [pendingDigestEntryIds, setPendingDigestEntryIds] = useState<
    Set<string>
  >(() => new Set());
  const {
    isMutating: predictionSubmitLoading,
    trigger: triggerPredictionSubmit,
  } = useSWRMutation<void, unknown, string, PredictionSubmitPayload>(
    'pull-request:predict',
    async (_key, { arg }) => {
      await apiClient.post(`/pull-requests/${arg.pullRequestId}/predict`, {
        predictedOutcome: arg.outcome,
      });
    },
  );
  const { isMutating: demoLoading, trigger: triggerDemoFlow } = useSWRMutation<
    void,
    unknown,
    string,
    DemoFlowPayload
  >('draft:demo:flow', async (_key, { arg }) => {
    await apiClient.post('/demo/flow', { draftId: arg.draftId });
  });
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; time: string }>
  >([]);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const similarTelemetryRef = useRef<string | null>(null);
  const arcTelemetryRef = useRef<string | null>(null);
  const lastRealtimeMutationEventIdRef = useRef<string | null>(null);
  const copyStatusTimeoutRef = useRef<number | null>(null);
  useTimeoutRefCleanup(copyStatusTimeoutRef);
  const watchlistAuthRequired = isAuthRequiredError(watchlistLoadError);
  const digestAuthRequired = isAuthRequiredError(digestLoadError);
  const predictionAuthRequired = isAuthRequiredError(predictionLoadError);
  const observerAuthRequired =
    manualObserverAuthRequired ||
    watchlistAuthRequired ||
    digestAuthRequired ||
    predictionAuthRequired;
  const isFollowed = useMemo(
    () =>
      draftId.length > 0 &&
      watchlistEntries.some((item) => isWatchlistEntryForDraft(item, draftId)),
    [draftId, watchlistEntries],
  );
  const digestEntries = digestEntriesData;
  const digestLoading = digestIsLoading || digestIsValidating;
  const digestError = getDigestError({
    digestAuthRequired,
    digestLoadError,
    t,
  });
  const predictionSummary = predictionSummaryData ?? null;
  const predictionLoading =
    predictionSummaryIsLoading ||
    predictionSummaryIsValidating ||
    predictionSubmitLoading;
  const predictionError = getPredictionError({
    predictionAuthRequired,
    predictionLoadError,
    predictionSubmitError,
    t,
  });
  const arcLoading = arcIsLoading || arcIsValidating;
  const arcError = getArcError({ arcLoadError, t });
  const similarLoading = similarDraftsIsLoading || similarDraftsIsValidating;
  const similarDrafts = similarDraftsData;
  const similarStatus = getSimilarStatus({
    draftId,
    similarDrafts,
    similarDraftsError,
    similarLoading,
    t,
  });
  const loading = draftLoading || fixRequestsLoading || pullRequestsLoading;
  const error = getPrimaryDraftError(draftLoadError, t);

  const { events } = useRealtimeRoom(
    draftId ? `post:${draftId}` : 'post:unknown',
  );

  const runDemoFlow = useCallback(async () => {
    if (!draftId) {
      return;
    }
    setDemoStatus(null);
    try {
      await triggerDemoFlow({ draftId }, { throwOnError: true });
      setDemoStatus(t('draftDetail.status.demoFlowComplete'));
      const refreshResults = await Promise.allSettled([
        mutateDraft(),
        mutateFixRequests(),
        mutatePullRequests(),
        mutateArc(),
      ]);
      if (refreshResults.some((result) => result.status === 'rejected')) {
        sendTelemetry({
          eventType: 'demo_flow_refresh_partial_failure',
          draftId,
        });
      }
    } catch (error: unknown) {
      setDemoStatus(
        getApiErrorMessage(error, t('draftDetail.errors.runDemoFlow')),
      );
    }
  }, [
    draftId,
    mutateArc,
    mutateDraft,
    mutateFixRequests,
    mutatePullRequests,
    triggerDemoFlow,
    t,
  ]);

  const copyDraftId = async () => {
    if (!draftId || typeof navigator === 'undefined') {
      return;
    }
    if (copyStatusTimeoutRef.current !== null) {
      window.clearTimeout(copyStatusTimeoutRef.current);
      copyStatusTimeoutRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(draftId);
      setCopyStatus(t('draftDetail.copy.copied'));
      copyStatusTimeoutRef.current = window.setTimeout(() => {
        setCopyStatus(null);
        copyStatusTimeoutRef.current = null;
      }, 2000);
    } catch (_error) {
      setCopyStatus(t('draftDetail.copy.failed'));
      copyStatusTimeoutRef.current = window.setTimeout(() => {
        setCopyStatus(null);
        copyStatusTimeoutRef.current = null;
      }, 2000);
    }
  };

  const markDigestSeen = async (entryId: string) => {
    if (pendingDigestEntryIds.has(entryId)) {
      return;
    }
    setPendingDigestEntryIds((current) => {
      if (current.has(entryId)) {
        return current;
      }
      const next = new Set(current);
      next.add(entryId);
      return next;
    });
    try {
      await apiClient.post(`/observers/digest/${entryId}/seen`);
      await mutateDigest(
        (current) =>
          (current ?? []).map((entry) =>
            entry.id === entryId ? { ...entry, isSeen: true } : entry,
          ),
        { revalidate: false },
      );
      sendTelemetry({
        eventType: 'digest_open',
        draftId,
        source: 'draft_detail',
      });
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setManualObserverAuthRequired(true);
      }
    } finally {
      setPendingDigestEntryIds((current) => {
        if (!current.has(entryId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
    }
  };

  const toggleFollow = async () => {
    if (!draftId || followInFlight) {
      return;
    }
    setFollowInFlight(true);
    try {
      if (isFollowed) {
        await apiClient.delete(`/observers/watchlist/${draftId}`);
      } else {
        await apiClient.post(`/observers/watchlist/${draftId}`);
      }
      setManualObserverAuthRequired(false);
      const nextState = !isFollowed;
      await mutateWatchlist(
        (current) => {
          const entries = current ?? [];
          if (nextState) {
            if (
              entries.some((item) => isWatchlistEntryForDraft(item, draftId))
            ) {
              return entries;
            }
            return [...entries, { draftId }];
          }
          return entries.filter(
            (item) => !isWatchlistEntryForDraft(item, draftId),
          );
        },
        { revalidate: false },
      );
      sendTelemetry({
        eventType: nextState ? 'watchlist_follow' : 'watchlist_unfollow',
        draftId,
        source: 'draft_detail',
      });
      if (nextState) {
        mutateDigest();
      }
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setManualObserverAuthRequired(true);
      }
    } finally {
      setFollowInFlight(false);
    }
  };

  const submitPrediction = async (outcome: 'merge' | 'reject') => {
    if (!pendingPullId) {
      return;
    }
    setPredictionSubmitError(null);
    try {
      await triggerPredictionSubmit(
        {
          outcome,
          pullRequestId: pendingPullId,
        },
        { throwOnError: true },
      );
      setManualObserverAuthRequired(false);
      sendTelemetry({
        eventType: 'pr_prediction_submit',
        draftId,
        source: 'draft_detail',
        metadata: { outcome },
      });
      await mutatePredictionSummary();
    } catch (error: unknown) {
      if (isAuthRequiredError(error)) {
        setManualObserverAuthRequired(true);
      } else {
        setPredictionSubmitError(
          getApiErrorMessage(error, t('draftDetail.errors.submitPrediction')),
        );
      }
    }
  };

  useEffect(() => {
    if (!draftId || similarLoading) {
      return;
    }
    const payload = getSimilarTelemetryPayload({
      draftId,
      similarDrafts,
      similarDraftsError,
    });
    if (!payload || similarTelemetryRef.current === payload.signature) {
      return;
    }
    similarTelemetryRef.current = payload.signature;
    sendTelemetry({
      eventType: payload.eventType,
      draftId,
      source: 'draft_detail',
      metadata: {
        mode: 'visual',
        profile: SEARCH_DEFAULT_PROFILE,
        ...payload.metadata,
      },
    });
  }, [draftId, similarDrafts, similarDraftsError, similarLoading]);

  useEffect(() => {
    if (!(arcView?.summary && arcView?.recap24h)) {
      return;
    }
    const signature = `${draftId}:${arcView.summary.state}:${arcView.recap24h.hasChanges}`;
    if (arcTelemetryRef.current === signature) {
      return;
    }
    arcTelemetryRef.current = signature;
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
    const last = events.at(-1);
    if (!(last && lastRealtimeMutationEventIdRef.current !== last.id)) {
      return;
    }
    lastRealtimeMutationEventIdRef.current = last.id;
    if (
      ['fix_request', 'pull_request', 'pull_request_decision'].includes(
        last.type,
      )
    ) {
      mutateFixRequests();
      mutatePullRequests();
      mutateArc();
      if (isFollowed) {
        mutateDigest();
      }
    }
    if (last.type === 'glowup_update') {
      mutateDraft();
      mutateArc();
    }
  }, [
    events,
    isFollowed,
    mutateDraft,
    mutateArc,
    mutateDigest,
    mutateFixRequests,
    mutatePullRequests,
  ]);

  const formatEventMessage = useCallback(
    (eventType: string, payload: Record<string, unknown>) =>
      formatDraftEventMessage(eventType, payload, t),
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

  const fixList = useMemo(
    () =>
      fixRequests.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        critic: `Studio ${item.criticId.slice(0, 6)}`,
      })),
    [fixRequests],
  );

  const prList = useMemo(
    () =>
      pullRequests.map((item) => ({
        id: item.id,
        status: item.status,
        description: item.description,
        maker: `Studio ${item.makerId.slice(0, 6)}`,
      })),
    [pullRequests],
  );

  const hasFixRequests = fixRequests.length > 0;
  const statusInfo = getDraftStatusInfo(
    hasFixRequests,
    Boolean(pendingPull),
    t,
  );
  const nextAction = getNextAction({
    draftId,
    pendingPull,
    hasFixRequests,
    copyStatus,
    demoLoading,
    copyDraftId,
    runDemoFlow,
    t,
  });

  return (
    <main className="grid gap-4 sm:gap-6">
      <div className="card p-4 sm:p-6">
        <p className="pill">{t('draftDetail.header.pill')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-foreground text-xl sm:text-2xl">
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
        <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:mt-4 sm:gap-3">
          <button
            className="rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 sm:py-2"
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
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm sm:p-4">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-4 text-muted-foreground text-sm sm:p-6">
          {t('draftDetail.loadingDraft')}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-4 sm:gap-6">
            {nextAction && (
              <div className="card p-4 sm:p-5">
                <p className="pill">{t('draftDetail.nextAction.pill')}</p>
                <h3 className="mt-3 font-semibold text-foreground text-lg">
                  {nextAction.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {nextAction.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:mt-4 sm:gap-3">
                  {'href' in nextAction ? (
                    <Link
                      className="rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:py-2"
                      href={nextAction.href as string}
                    >
                      {nextAction.ctaLabel}
                    </Link>
                  ) : (
                    <button
                      className="rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 sm:py-2"
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
            <div className="card p-4 sm:p-5">
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
                      className="rounded-lg border border-border/25 bg-background/60 p-2.5 text-xs sm:p-3"
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
                  className="inline-flex items-center rounded-lg border border-border/25 bg-background/58 px-3 py-2 text-foreground text-xs transition hover:border-border/45 hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <div className="grid gap-4 sm:gap-6">
            <HeatMapOverlay />
            <PredictionWidget
              authRequired={observerAuthRequired}
              error={predictionError}
              loading={predictionLoading}
              onPredict={submitPrediction}
              submitLoading={predictionSubmitLoading}
              summary={predictionSummary}
            />
            <div className="card p-4 sm:p-5">
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
                  aria-busy={followInFlight}
                  className={`rounded-full px-4 py-1.5 font-semibold text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:py-2 ${
                    isFollowed
                      ? 'border border-chart-2/55 bg-chart-2/14 text-chart-2'
                      : 'bg-primary text-primary-foreground'
                  }`}
                  disabled={followInFlight || !draftId}
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
              pendingEntryIds={pendingDigestEntryIds}
            />
            <div className="card p-4 sm:p-5">
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
                      className="rounded-lg border border-border/25 bg-background/60 p-2"
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
