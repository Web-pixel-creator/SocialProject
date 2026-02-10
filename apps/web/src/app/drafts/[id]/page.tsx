'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [fixRequests, setFixRequests] = useState<FixRequest[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { events } = useRealtimeRoom(
    draftId ? `post:${draftId}` : 'post:unknown',
  );

  const loadDraft = useCallback(async () => {
    if (!draftId) {
      return;
    }
    const response = await apiClient.get(`/drafts/${draftId}`);
    setDraft(response.data.draft);
    setVersions(response.data.versions ?? []);
  }, [draftId]);

  const loadFixRequests = useCallback(async () => {
    if (!draftId) {
      return;
    }
    const response = await apiClient.get(`/drafts/${draftId}/fix-requests`);
    setFixRequests(response.data ?? []);
  }, [draftId]);

  const loadPullRequests = useCallback(async () => {
    if (!draftId) {
      return;
    }
    const response = await apiClient.get(`/drafts/${draftId}/pull-requests`);
    setPullRequests(response.data ?? []);
  }, [draftId]);

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
      setArcError(getApiErrorMessage(error, t('legacy.failed_to_load_arc')));
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
          getApiErrorMessage(error, t('legacy.failed_to_load_digest')),
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
              t('legacy.failed_to_load_prediction_summary'),
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
      setDemoStatus(t('legacy.demo_flow_complete_new_fix_request_and'));
      await Promise.all([loadDraft(), loadFixRequests(), loadPullRequests()]);
    } catch (error: unknown) {
      setDemoStatus(
        getApiErrorMessage(error, t('legacy.failed_to_run_demo_flow')),
      );
    } finally {
      setDemoLoading(false);
    }
  }, [draftId, loadDraft, loadFixRequests, loadPullRequests, t]);

  const copyDraftId = async () => {
    if (!draftId || typeof navigator === 'undefined') {
      return;
    }
    try {
      await navigator.clipboard.writeText(draftId);
      setCopyStatus(t('legacy.copied'));
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (_error) {
      setCopyStatus(t('legacy.copy_failed'));
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const loadSimilarDrafts = useCallback(async () => {
    if (!draftId) {
      setSimilarDrafts([]);
      setSimilarStatus(t('legacy.draft_id_missing'));
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
        setSimilarStatus(t('legacy.no_similar_drafts_yet'));
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
        setSimilarStatus(t('legacy.similar_works_available_after_analysis'));
      } else if (code === 'DRAFT_NOT_FOUND') {
        setSimilarStatus(t('legacy.draft_not_found'));
      } else {
        setSimilarStatus(
          getApiErrorMessage(error, t('legacy.failed_to_load_similar_drafts')),
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
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          loadDraft(),
          loadFixRequests(),
          loadPullRequests(),
          loadArc(),
          loadWatchlist(),
          loadDigest(),
        ]);
      } catch (error: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(error, t('legacy.failed_to_load_draft')));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [
    loadArc,
    loadDigest,
    loadDraft,
    loadFixRequests,
    loadPullRequests,
    loadWatchlist,
    t,
  ]);

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
          getApiErrorMessage(error, t('legacy.failed_to_submit_prediction')),
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
      loadFixRequests();
      loadPullRequests();
      loadArc();
      if (isFollowed) {
        loadDigest();
      }
    }
    if (last.type === 'glowup_update') {
      loadDraft();
      loadArc();
    }
  }, [
    events,
    isFollowed,
    loadArc,
    loadDigest,
    loadDraft,
    loadFixRequests,
    loadPullRequests,
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
        return t('legacy.new_fix_request_submitted');
      }
      if (eventType === 'pull_request') {
        return t('legacy.new_pull_request_submitted');
      }
      if (eventType === 'pull_request_decision') {
        const decision = String(payload?.decision ?? 'updated').replace(
          '_',
          ' ',
        );
        return `${t('legacy.pull_request')} ${decision}`;
      }
      if (eventType === 'glowup_update') {
        return t('legacy.glowup_score_updated');
      }
      if (eventType === 'draft_released') {
        return t('legacy.draft_released');
      }
      return t('legacy.draft_activity_updated');
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
        label: t('legacy.ready_for_review'),
        tone: 'bg-amber-100 text-amber-800',
      };
    }
    if (hasFixRequests) {
      return {
        label: t('legacy.seeking_pr'),
        tone: 'bg-muted/70 text-foreground',
      };
    }
    return {
      label: t('legacy.needs_help'),
      tone: 'bg-rose-500/15 text-rose-500',
    };
  })();

  const nextAction = (() => {
    if (!draftId) {
      return null;
    }
    if (pendingPull) {
      return {
        title: t('legacy.review_pending_pr'),
        description: t('legacy.a_pull_request_is_waiting_for_review'),
        ctaLabel: t('legacy.open_pr'),
        href: `/pull-requests/${pendingPull.id}`,
      };
    }
    if (hasFixRequests) {
      return {
        title: t('legacy.share_draft_for_pr'),
        description: t('legacy.fix_requests_are_ready_share_the_draft'),
        ctaLabel: copyStatus ?? t('legacy.copy_draft_id'),
        onClick: copyDraftId,
      };
    }
    return {
      title: t('legacy.start_critique'),
      description: t('legacy.no_fix_requests_yet_run_a_demo'),
      ctaLabel: demoLoading
        ? t('legacy.running_demo')
        : t('legacy.run_demo_flow'),
      onClick: runDemoFlow,
    };
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('legacy.draft_detail')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-2xl text-foreground">
            {draftId ? `${t('legacy.draft')} ${draftId}` : t('legacy.draft')}
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
          {t('legacy.track_every_critique_and_pr_in_real')}{' '}
          {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 disabled:opacity-60"
            disabled={demoLoading || !draftId}
            onClick={runDemoFlow}
            type="button"
          >
            {demoLoading ? t('legacy.running_demo') : t('legacy.run_demo_flow')}
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
          {t('legacy.loading_draft')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            {nextAction && (
              <div className="card p-4">
                <p className="pill">{t('legacy.next_best_action')}</p>
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
                  {t('legacy.similar_drafts')}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {t('legacy.visual_match')}
                </span>
              </div>
              {similarLoading && (
                <p className="mt-3 text-muted-foreground text-xs">
                  {t('legacy.loading_similar_drafts')}
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
                        {t('legacy.similarity')}{' '}
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
                  {t('legacy.see_more_similar')}
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
              <p className="pill">{t('legacy.follow_chain')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('legacy.track_every_change')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {t('legacy.get_notified_in_app_when_this_draft')}
              </p>
              {observerAuthRequired && (
                <p className="mt-2 text-muted-foreground text-xs">
                  {t('legacy.sign_in_as_observer_to_follow_drafts')}
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
                    ? t('legacy.following')
                    : t('legacy.follow_chain')}
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
              <p className="pill">{t('legacy.activity')}</p>
              <h3 className="mt-3 font-semibold text-foreground text-sm">
                {t('legacy.in_app_updates')}
              </h3>
              <p className="text-muted-foreground text-xs">
                {isFollowed
                  ? t('legacy.updates_appear_when_this_draft_changes')
                  : t('legacy.follow_the_chain_to_see_updates_here')}
              </p>
              <div className="mt-4 grid gap-2 text-muted-foreground text-xs">
                {notifications.length === 0 ? (
                  <span>{t('legacy.no_updates_yet')}</span>
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
