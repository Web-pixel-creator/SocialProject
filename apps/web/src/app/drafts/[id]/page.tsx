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
import {
  type RealtimeEvent,
  useRealtimeRoom,
} from '../../../hooks/useRealtimeRoom';
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
  authorId?: string;
  author_id?: string;
}

interface DraftProvenance {
  authenticityStatus: 'unverified' | 'metadata_only' | 'verified';
  humanSparkScore: number;
  humanBriefPresent: boolean;
  agentStepCount: number;
  releaseCount: number;
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

interface StyleFusionResult {
  draftId: string;
  generatedAt: string;
  titleSuggestion: string;
  styleDirectives: string[];
  winningPrHints: string[];
  sample: SimilarDraft[];
}

interface DraftPayload {
  draft: Draft | null;
  versions: Version[];
  provenance?: DraftProvenance | null;
}

interface FollowingStudioItem {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
  followerCount: number;
}

interface FollowingStudioShape {
  id?: unknown;
  studioName?: unknown;
  studio_name?: unknown;
  impact?: unknown;
  signal?: unknown;
  followerCount?: unknown;
  follower_count?: unknown;
}

interface DemoFlowPayload {
  draftId: string;
}

interface PredictionSubmitPayload {
  pullRequestId: string;
  outcome: 'merge' | 'reject';
  stakePoints: number;
}

interface OrchestrationAttemptView {
  provider: string;
  status: string;
  latencyMs: number | null;
  errorCode: string | null;
}

interface OrchestrationTimelineEntry {
  id: string;
  type: 'step' | 'completed';
  sequence: number;
  role: string | null;
  failed: boolean;
  completed: boolean | null;
  provider: string | null;
  attempts: OrchestrationAttemptView[];
  stepCount: number | null;
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
    provenance: response.data?.provenance ?? null,
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

const resolveFollowingStudioName = (studio: FollowingStudioShape): string => {
  if (typeof studio.studioName === 'string') {
    return studio.studioName;
  }
  if (typeof studio.studio_name === 'string') {
    return studio.studio_name;
  }
  return 'Studio';
};

const fetchObserverFollowing = async (): Promise<FollowingStudioItem[]> => {
  const response = await apiClient.get('/me/following', {
    params: { limit: 4 },
  });
  if (!Array.isArray(response.data)) {
    return [];
  }
  return response.data
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }
      const studio = item as FollowingStudioShape;
      if (typeof studio.id !== 'string') {
        return null;
      }
      return {
        id: studio.id,
        studioName: resolveFollowingStudioName(studio),
        impact: Number(studio.impact ?? 0),
        signal: Number(studio.signal ?? 0),
        followerCount: Number(
          studio.followerCount ?? studio.follower_count ?? 0,
        ),
      };
    })
    .filter((item): item is FollowingStudioItem => item !== null);
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

const generateStyleFusion = async (
  draftId: string,
): Promise<StyleFusionResult> => {
  const response = await apiClient.post('/search/style-fusion', {
    draftId,
    type: 'draft',
    limit: 3,
  });
  return response.data as StyleFusionResult;
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

const toNestedRealtimePayload = (payload: Record<string, unknown>) =>
  payload.data && typeof payload.data === 'object'
    ? (payload.data as Record<string, unknown>)
    : payload;

const toOrchestrationAttempts = (
  value: unknown,
): OrchestrationAttemptView[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }
      const body = item as Record<string, unknown>;
      const provider =
        typeof body.provider === 'string' && body.provider.trim().length > 0
          ? body.provider
          : 'unknown';
      const status =
        typeof body.status === 'string' && body.status.trim().length > 0
          ? body.status
          : 'unknown';
      const latency = Number(body.latencyMs);
      const errorCode =
        typeof body.errorCode === 'string' && body.errorCode.trim().length > 0
          ? body.errorCode
          : null;
      return {
        provider,
        status,
        latencyMs: Number.isFinite(latency) && latency >= 0 ? latency : null,
        errorCode,
      };
    })
    .filter((attempt): attempt is OrchestrationAttemptView => attempt !== null);
};

const buildOrchestrationTimelineEntries = (
  events: RealtimeEvent[],
): OrchestrationTimelineEntry[] => {
  const timeline: OrchestrationTimelineEntry[] = [];
  for (const event of events) {
    if (
      event.type !== 'agent_gateway_orchestration_step' &&
      event.type !== 'agent_gateway_orchestration_completed'
    ) {
      continue;
    }
    const payload = toNestedRealtimePayload(event.payload);
    if (event.type === 'agent_gateway_orchestration_step') {
      const role =
        typeof payload.role === 'string' && payload.role.trim().length > 0
          ? payload.role
          : null;
      const provider =
        typeof payload.selectedProvider === 'string' &&
        payload.selectedProvider.trim().length > 0
          ? payload.selectedProvider
          : null;
      timeline.push({
        id: event.id,
        type: 'step',
        sequence: event.sequence,
        role,
        failed: payload.failed === true,
        completed: null,
        provider,
        attempts: toOrchestrationAttempts(payload.attempts),
        stepCount: null,
      });
      continue;
    }

    const stepCount = Number(payload.stepCount);
    timeline.push({
      id: event.id,
      type: 'completed',
      sequence: event.sequence,
      role: null,
      failed: false,
      completed:
        typeof payload.completed === 'boolean' ? payload.completed : null,
      provider: null,
      attempts: [],
      stepCount: Number.isFinite(stepCount) ? stepCount : null,
    });
  }

  return timeline
    .sort((left, right) => right.sequence - left.sequence)
    .slice(0, 8);
};

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

const getProvenanceTone = (
  status: DraftProvenance['authenticityStatus'],
): string => {
  if (status === 'verified') {
    return 'tag-success border';
  }
  if (status === 'metadata_only') {
    return 'border border-primary/35 bg-primary/12 text-primary';
  }
  return 'border border-border/35 bg-muted/60 text-muted-foreground';
};

const getProvenanceLabel = (
  status: DraftProvenance['authenticityStatus'],
  t: Translate,
): string => {
  if (status === 'verified') {
    return t('feed.provenance.verified');
  }
  if (status === 'metadata_only') {
    return t('feed.provenance.traceable');
  }
  return t('feed.provenance.unverified');
};

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

const getActivityDescription = ({
  isFollowed,
  isFollowingAuthorStudio,
  t,
}: {
  isFollowed: boolean;
  isFollowingAuthorStudio: boolean;
  t: Translate;
}): string => {
  if (isFollowed) {
    return t('draftDetail.activity.descriptionFollowing');
  }
  if (isFollowingAuthorStudio) {
    return t('draftDetail.activity.descriptionFollowingStudio');
  }
  return t('draftDetail.activity.descriptionNotFollowing');
};

const FollowingStudiosCard = ({
  t,
  followingStudios,
  draftAuthorId,
}: {
  t: Translate;
  followingStudios: FollowingStudioItem[];
  draftAuthorId: string;
}) => (
  <div className="card p-4 sm:p-5">
    <p className="pill">{t('draftDetail.followingStudios.pill')}</p>
    <h3 className="mt-3 font-semibold text-foreground text-sm">
      {t('draftDetail.followingStudios.title')}
    </h3>
    <p className="text-muted-foreground text-xs">
      {t('draftDetail.followingStudios.description')}
    </p>
    <div className="mt-4 grid gap-2 text-xs">
      {followingStudios.length === 0 ? (
        <span className="text-muted-foreground">
          {t('draftDetail.followingStudios.empty')}
        </span>
      ) : (
        followingStudios.map((studio) => (
          <Link
            className="rounded-lg border border-border/25 bg-background/60 p-2.5 transition hover:border-border/45 hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/studios/${studio.id}`}
            key={studio.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {studio.studioName}
              </span>
              {studio.id === draftAuthorId && (
                <span className="rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 font-semibold text-[10px] text-primary">
                  {t('draftDetail.followingStudios.currentDraft')}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Impact {studio.impact.toFixed(0)} · Signal{' '}
              {studio.signal.toFixed(0)} · {t('studioCard.followersLabel')}{' '}
              {studio.followerCount}
            </p>
          </Link>
        ))
      )}
    </div>
  </div>
);

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
  const resolvedPayload = toNestedRealtimePayload(payload);

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
  if (eventType === 'agent_gateway_orchestration_step') {
    const role =
      typeof resolvedPayload.role === 'string'
        ? resolvedPayload.role.replace(/_/g, ' ')
        : 'agent';
    if (resolvedPayload.failed === true) {
      return `${t('draftDetail.events.orchestrationStepFailed')} (${role})`;
    }
    return `${t('draftDetail.events.orchestrationStep')} (${role})`;
  }
  if (eventType === 'agent_gateway_orchestration_completed') {
    const stepCountRaw = Number(resolvedPayload.stepCount);
    if (Number.isFinite(stepCountRaw) && stepCountRaw > 0) {
      return `${t('draftDetail.events.orchestrationCompleted')} (${stepCountRaw})`;
    }
    return t('draftDetail.events.orchestrationCompleted');
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

const runStyleFusionRequest = async ({
  draftId,
  t,
  generateStyleFusionResult,
  setStyleFusion,
  setStyleFusionError,
}: {
  draftId: string;
  t: Translate;
  generateStyleFusionResult: () => Promise<StyleFusionResult | undefined>;
  setStyleFusion: (result: StyleFusionResult | null) => void;
  setStyleFusionError: (message: string | null) => void;
}): Promise<void> => {
  if (!draftId) {
    return;
  }
  setStyleFusionError(null);
  try {
    const result = await generateStyleFusionResult();
    setStyleFusion(result ?? null);
    sendTelemetry({
      eventType: 'style_fusion_generate',
      draftId,
      source: 'draft_detail',
      metadata: {
        sampleCount: result?.sample?.length ?? 0,
      },
    });
  } catch (error: unknown) {
    setStyleFusionError(
      getApiErrorMessage(error, t('draftDetail.errors.generateStyleFusion')),
    );
  }
};

const StyleFusionPanel = ({
  draftId,
  onGenerate,
  styleFusion,
  styleFusionError,
  styleFusionLoading,
  t,
}: {
  draftId: string;
  onGenerate: () => void;
  styleFusion: StyleFusionResult | null;
  styleFusionError: string | null;
  styleFusionLoading: boolean;
  t: Translate;
}) => {
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="inline-flex items-center rounded-lg border border-border/25 bg-background/58 px-3 py-2 font-semibold text-foreground text-xs transition hover:border-border/45 hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!draftId || styleFusionLoading}
          onClick={onGenerate}
          type="button"
        >
          {styleFusionLoading
            ? t('draftDetail.similar.generatingStyleFusion')
            : t('draftDetail.similar.generateStyleFusion')}
        </button>
        {styleFusionError && (
          <p className="text-destructive text-xs">{styleFusionError}</p>
        )}
      </div>
      {styleFusion && (
        <div className="mt-3 rounded-lg border border-border/25 bg-background/58 p-3 text-xs sm:p-3.5">
          <p className="text-[10px] text-muted-foreground uppercase">
            {t('draftDetail.similar.styleFusionResult')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {styleFusion.titleSuggestion}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">
                {t('draftDetail.similar.styleDirectives')}
              </p>
              {styleFusion.styleDirectives.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {styleFusion.styleDirectives.map((directive) => (
                    <li key={directive}>{directive}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  {t('draftDetail.similar.noStyleDirectives')}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">
                {t('draftDetail.similar.winningHints')}
              </p>
              {styleFusion.winningPrHints.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {styleFusion.winningPrHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  {t('draftDetail.similar.noWinningHints')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
  const provenance = draftPayload?.provenance ?? null;
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
  const { data: followingStudios = [], error: followingLoadError } = useSWR<
    FollowingStudioItem[]
  >(draftId ? 'observer:following:studios' : null, fetchObserverFollowing, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
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
  const [styleFusion, setStyleFusion] = useState<StyleFusionResult | null>(
    null,
  );
  const [styleFusionError, setStyleFusionError] = useState<string | null>(null);
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
        stakePoints: arg.stakePoints,
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
  const { isMutating: styleFusionLoading, trigger: triggerStyleFusion } =
    useSWRMutation<StyleFusionResult, unknown, string, { draftId: string }>(
      'draft:style-fusion',
      async (_key, { arg }) => generateStyleFusion(arg.draftId),
    );
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
  const followingAuthRequired = isAuthRequiredError(followingLoadError);
  const predictionAuthRequired = isAuthRequiredError(predictionLoadError);
  const observerAuthRequired =
    manualObserverAuthRequired ||
    watchlistAuthRequired ||
    digestAuthRequired ||
    followingAuthRequired ||
    predictionAuthRequired;
  const draftAuthorId = draft?.authorId ?? draft?.author_id ?? '';
  const isFollowed = useMemo(
    () =>
      draftId.length > 0 &&
      watchlistEntries.some((item) => isWatchlistEntryForDraft(item, draftId)),
    [draftId, watchlistEntries],
  );
  const isFollowingAuthorStudio = useMemo(
    () =>
      draftAuthorId.length > 0 &&
      followingStudios.some((studio) => studio.id === draftAuthorId),
    [draftAuthorId, followingStudios],
  );
  const receivesObserverUpdates = isFollowed || isFollowingAuthorStudio;
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
  const orchestrationTimeline = useMemo(
    () => buildOrchestrationTimelineEntries(events),
    [events],
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

  const runStyleFusion = useCallback(async () => {
    await runStyleFusionRequest({
      draftId,
      t,
      generateStyleFusionResult: () =>
        triggerStyleFusion({ draftId }, { throwOnError: true }),
      setStyleFusion,
      setStyleFusionError,
    });
  }, [draftId, t, triggerStyleFusion]);

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

  const submitPrediction = async (
    outcome: 'merge' | 'reject',
    stakePoints: number,
  ) => {
    if (!pendingPullId) {
      return;
    }
    setPredictionSubmitError(null);
    try {
      await triggerPredictionSubmit(
        {
          outcome,
          pullRequestId: pendingPullId,
          stakePoints,
        },
        { throwOnError: true },
      );
      setManualObserverAuthRequired(false);
      sendTelemetry({
        eventType: 'pr_prediction_submit',
        draftId,
        source: 'draft_detail',
        metadata: { outcome, stakePoints },
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
    if (!draftId) {
      setStyleFusion(null);
      setStyleFusionError(null);
      return;
    }
    setStyleFusion(null);
    setStyleFusionError(null);
  }, [draftId]);

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
      if (receivesObserverUpdates) {
        mutateDigest();
      }
    }
    if (last.type === 'glowup_update') {
      mutateDraft();
      mutateArc();
    }
  }, [
    events,
    receivesObserverUpdates,
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
    if (!receivesObserverUpdates || events.length === 0) {
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
  }, [events, formatEventMessage, receivesObserverUpdates]);

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
          <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
            {draftId ? `${t('common.draft')} ${draftId}` : t('common.draft')}
          </h1>
          {draft && (
            <span
              className={`rounded-full px-3 py-1 font-semibold text-xs ${statusInfo.tone}`}
            >
              {statusInfo.label}
            </span>
          )}
          {provenance && (
            <span
              className={`rounded-full px-3 py-1 font-semibold text-xs ${getProvenanceTone(
                provenance.authenticityStatus,
              )}`}
            >
              {getProvenanceLabel(provenance.authenticityStatus, t)}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {t('draftDetail.header.subtitle')}{' '}
          {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
          {provenance
            ? ` • ${t('feed.provenance.spark')}: ${provenance.humanSparkScore.toFixed(0)}`
            : ''}
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
                <h2 className="mt-3 font-semibold text-foreground text-lg">
                  {nextAction.title}
                </h2>
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
              <StyleFusionPanel
                draftId={draftId}
                onGenerate={runStyleFusion}
                styleFusion={styleFusion}
                styleFusionError={styleFusionError}
                styleFusionLoading={styleFusionLoading}
                t={t}
              />
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
            <FollowingStudiosCard
              draftAuthorId={draftAuthorId}
              followingStudios={followingStudios}
              t={t}
            />
            <div className="card p-4 sm:p-5">
              <p className="pill">{t('draftDetail.orchestration.pill')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('draftDetail.orchestration.title')}
              </h3>
              <div className="mt-4 grid gap-2 text-muted-foreground text-xs">
                {orchestrationTimeline.length === 0 ? (
                  <span>{t('draftDetail.orchestration.empty')}</span>
                ) : (
                  orchestrationTimeline.map((entry) => {
                    const roleLabel = (
                      entry.role ?? t('draftDetail.orchestration.unknownRole')
                    ).replace(/_/g, ' ');
                    let title = t('draftDetail.events.orchestrationCompleted');
                    if (entry.type === 'step') {
                      title = entry.failed
                        ? t('draftDetail.events.orchestrationStepFailed')
                        : t('draftDetail.events.orchestrationStep');
                      title = `${title} (${roleLabel})`;
                    } else if (entry.completed === false) {
                      title = t('draftDetail.orchestration.completedFailed');
                    }

                    return (
                      <div
                        className="rounded-lg border border-border/25 bg-background/60 p-2.5"
                        key={entry.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-medium ${
                              entry.type === 'step' && entry.failed
                                ? 'text-destructive'
                                : 'text-foreground'
                            }`}
                          >
                            {title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            #{entry.sequence}
                          </span>
                        </div>
                        {entry.type === 'step' && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {t('draftDetail.orchestration.provider')}:&nbsp;
                            {entry.provider ??
                              t('draftDetail.orchestration.unknownProvider')}
                          </p>
                        )}
                        {entry.type === 'completed' &&
                          entry.stepCount !== null &&
                          entry.stepCount >= 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t('draftDetail.orchestration.steps')}:&nbsp;
                              {entry.stepCount}
                            </p>
                          )}
                        {entry.type === 'step' && entry.attempts.length > 0 && (
                          <>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {t('draftDetail.orchestration.attempts')}:&nbsp;
                              {entry.attempts.length}
                            </p>
                            <ul className="mt-1 grid gap-1">
                              {entry.attempts.map((attempt, index) => (
                                <li
                                  className="text-[11px] text-muted-foreground"
                                  key={`${entry.id}-${attempt.provider}-${index}`}
                                >
                                  {attempt.provider} • {attempt.status}
                                  {attempt.latencyMs !== null
                                    ? ` • ${attempt.latencyMs}ms`
                                    : ''}
                                  {attempt.errorCode
                                    ? ` • ${attempt.errorCode}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="card p-4 sm:p-5">
              <p className="pill">{t('draftDetail.activity.pill')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('draftDetail.activity.title')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {getActivityDescription({
                  isFollowed,
                  isFollowingAuthorStudio,
                  t,
                })}
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
