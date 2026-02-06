'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRealtimeRoom } from '../../../hooks/useRealtimeRoom';
import { apiClient } from '../../../lib/api';
import { SEARCH_DEFAULT_PROFILE } from '../../../lib/config';

const HeatMapOverlay = dynamic(
  () =>
    import('../../../components/HeatMapOverlay').then(
      (mod) => mod.HeatMapOverlay,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="card p-4 text-slate-500 text-sm">Loading heat map...</div>
    ),
  },
);
const LivePanel = dynamic(
  () => import('../../../components/LivePanel').then((mod) => mod.LivePanel),
  {
    ssr: false,
    loading: () => (
      <div className="card p-4 text-slate-500 text-sm">
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

const sendTelemetry = async (payload: Record<string, any>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

const isAuthRequiredError = (error: any) => {
  const status = error?.response?.status;
  return status === 401 || status === 403;
};

export default function DraftDetailPage() {
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

  const loadDraft = async () => {
    if (!draftId) return;
    const response = await apiClient.get(`/drafts/${draftId}`);
    setDraft(response.data.draft);
    setVersions(response.data.versions ?? []);
  };

  const loadFixRequests = async () => {
    if (!draftId) return;
    const response = await apiClient.get(`/drafts/${draftId}/fix-requests`);
    setFixRequests(response.data ?? []);
  };

  const loadPullRequests = async () => {
    if (!draftId) return;
    const response = await apiClient.get(`/drafts/${draftId}/pull-requests`);
    setPullRequests(response.data ?? []);
  };

  const loadArc = async () => {
    if (!draftId) return;
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
    } catch (err: any) {
      setArcView(null);
      setArcError(err?.response?.data?.message ?? 'Failed to load arc.');
    } finally {
      setArcLoading(false);
    }
  };

  const loadWatchlist = async () => {
    if (!draftId) return;
    try {
      const response = await apiClient.get('/observers/watchlist');
      const list = Array.isArray(response.data) ? response.data : [];
      setObserverAuthRequired(false);
      setIsFollowed(
        list.some(
          (item: any) =>
            item?.draftId === draftId || item?.draft_id === draftId,
        ),
      );
    } catch (err: any) {
      if (isAuthRequiredError(err)) {
        setObserverAuthRequired(true);
        setIsFollowed(false);
        return;
      }
      setIsFollowed(false);
    }
  };

  const loadDigest = async () => {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const response = await apiClient.get('/observers/digest', {
        params: { unseenOnly: false, limit: 8 },
      });
      setObserverAuthRequired(false);
      setDigestEntries(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      if (isAuthRequiredError(err)) {
        setObserverAuthRequired(true);
        setDigestEntries([]);
      } else {
        setDigestError(
          err?.response?.data?.message ?? 'Failed to load digest.',
        );
        setDigestEntries([]);
      }
    } finally {
      setDigestLoading(false);
    }
  };

  const loadPredictionSummary = async (pullRequestId: string) => {
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
    } catch (err: any) {
      if (isAuthRequiredError(err)) {
        setObserverAuthRequired(true);
        setPredictionSummary(null);
      } else {
        setPredictionError(
          err?.response?.data?.message ?? 'Failed to load prediction summary.',
        );
        setPredictionSummary(null);
      }
    } finally {
      setPredictionLoading(false);
    }
  };

  const runDemoFlow = async () => {
    if (!draftId) return;
    setDemoLoading(true);
    setDemoStatus(null);
    try {
      await apiClient.post('/demo/flow', { draftId });
      setDemoStatus('Demo flow complete. New fix request and PR created.');
      await Promise.all([loadDraft(), loadFixRequests(), loadPullRequests()]);
    } catch (err: any) {
      setDemoStatus(err?.response?.data?.message ?? 'Failed to run demo flow.');
    } finally {
      setDemoLoading(false);
    }
  };

  const copyDraftId = async () => {
    if (!draftId || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(draftId);
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (_error) {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const loadSimilarDrafts = async () => {
    if (!draftId) {
      setSimilarDrafts([]);
      setSimilarStatus('Draft id missing.');
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
        setSimilarStatus('No similar drafts yet.');
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
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const reason = code ?? 'error';
      if (code === 'EMBEDDING_NOT_FOUND') {
        setSimilarStatus('Similar works available after analysis.');
      } else if (code === 'DRAFT_NOT_FOUND') {
        setSimilarStatus('Draft not found.');
      } else {
        setSimilarStatus(
          err?.response?.data?.message ?? 'Failed to load similar drafts.',
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
  };

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
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message ?? 'Failed to load draft.');
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
  }, [draftId]);

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
    } catch (err: any) {
      if (isAuthRequiredError(err)) {
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
    } catch (err: any) {
      if (isAuthRequiredError(err)) {
        setObserverAuthRequired(true);
      } else {
        setPredictionError(
          err?.response?.data?.message ?? 'Failed to submit prediction.',
        );
      }
    } finally {
      setPredictionSubmitLoading(false);
    }
  };

  useEffect(() => {
    loadSimilarDrafts();
  }, [draftId]);

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
    if (events.length === 0) return;
    const last = events.at(-1);
    if (!last) return;
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
  }, [events.length, isFollowed]);

  useEffect(() => {
    const pendingPull = pullRequests.find((item) => item.status === 'pending');
    if (!pendingPull) {
      setPredictionSummary(null);
      setPredictionError(null);
      return;
    }
    loadPredictionSummary(pendingPull.id);
  }, [pullRequests]);

  const formatEventMessage = (
    eventType: string,
    payload: Record<string, unknown>,
  ) => {
    if (eventType === 'fix_request') return 'New fix request submitted';
    if (eventType === 'pull_request') return 'New pull request submitted';
    if (eventType === 'pull_request_decision') {
      const decision = String(payload?.decision ?? 'updated').replace('_', ' ');
      return `Pull request ${decision}`;
    }
    if (eventType === 'glowup_update') return 'GlowUp score updated';
    if (eventType === 'draft_released') return 'Draft released';
    return 'Draft activity updated';
  };

  useEffect(() => {
    if (!isFollowed || events.length === 0) return;
    const fresh = events.filter(
      (event) => !seenEventsRef.current.has(event.id),
    );
    if (fresh.length === 0) return;
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
  }, [events, isFollowed]);

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
      return { label: 'Ready for review', tone: 'bg-amber-100 text-amber-800' };
    }
    if (hasFixRequests) {
      return { label: 'Seeking PR', tone: 'bg-slate-200 text-slate-700' };
    }
    return { label: 'Needs help', tone: 'bg-rose-100 text-rose-700' };
  })();

  const nextAction = (() => {
    if (!draftId) return null;
    if (pendingPull) {
      return {
        title: 'Review pending PR',
        description: 'A pull request is waiting for review.',
        ctaLabel: 'Open PR',
        href: `/pull-requests/${pendingPull.id}`,
      };
    }
    if (hasFixRequests) {
      return {
        title: 'Share draft for PR',
        description: 'Fix requests are ready. Share the draft ID to get a PR.',
        ctaLabel: copyStatus ?? 'Copy draft ID',
        onClick: copyDraftId,
      };
    }
    return {
      title: 'Start critique',
      description: 'No fix requests yet. Run a demo flow to seed the workflow.',
      ctaLabel: demoLoading ? 'Running demo...' : 'Run demo flow',
      onClick: runDemoFlow,
    };
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Draft Detail</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-2xl text-ink">
            {draftId ? `Draft ${draftId}` : 'Draft'}
          </h2>
          {draft && (
            <span
              className={`rounded-full px-3 py-1 font-semibold text-xs ${statusInfo.tone}`}
            >
              {statusInfo.label}
            </span>
          )}
        </div>
        <p className="text-slate-600 text-sm">
          Track every critique and PR in real-time.{' '}
          {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-ink px-5 py-2 font-semibold text-white text-xs disabled:opacity-60"
            disabled={demoLoading || !draftId}
            onClick={runDemoFlow}
            type="button"
          >
            {demoLoading ? 'Running demo...' : 'Run demo flow'}
          </button>
          {demoStatus && (
            <span className="text-slate-500 text-xs">{demoStatus}</span>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-6 text-slate-500 text-sm">Loading draft...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            {nextAction && (
              <div className="card p-4">
                <p className="pill">Next best action</p>
                <h3 className="mt-3 font-semibold text-ink text-lg">
                  {nextAction.title}
                </h3>
                <p className="text-slate-600 text-sm">
                  {nextAction.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {'href' in nextAction ? (
                    <Link
                      className="rounded-full bg-ink px-5 py-2 font-semibold text-white text-xs"
                      href={nextAction.href as string}
                    >
                      {nextAction.ctaLabel}
                    </Link>
                  ) : (
                    <button
                      className="rounded-full bg-ink px-5 py-2 font-semibold text-white text-xs disabled:opacity-60"
                      disabled={demoLoading && !hasFixRequests}
                      onClick={nextAction.onClick}
                      type="button"
                    >
                      {nextAction.ctaLabel}
                    </button>
                  )}
                  {copyStatus && (
                    <span className="text-slate-500 text-xs">{copyStatus}</span>
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
                <h3 className="font-semibold text-ink text-sm">
                  Similar drafts
                </h3>
                <span className="text-slate-500 text-xs">Visual match</span>
              </div>
              {similarLoading ? (
                <p className="mt-3 text-slate-500 text-xs">
                  Loading similar drafts...
                </p>
              ) : similarStatus ? (
                <p className="mt-3 text-slate-500 text-xs">{similarStatus}</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {similarDrafts.map((item) => (
                    <li
                      className="rounded-lg border border-slate-200 bg-white/70 p-3 text-xs"
                      key={item.id}
                    >
                      <p className="text-[10px] text-slate-500 uppercase">
                        {item.type}
                      </p>
                      <p className="text-ink text-sm">{item.title}</p>
                      <p className="text-[11px] text-slate-500">
                        Similarity {Number(item.score ?? 0).toFixed(2)} | GlowUp{' '}
                        {Number(item.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Link
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 text-xs hover:border-slate-300"
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
                  See more similar
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
              <p className="pill">Follow chain</p>
              <h3 className="mt-3 font-semibold text-ink text-sm">
                Track every change
              </h3>
              <p className="text-slate-600 text-xs">
                Get notified in-app when this draft receives fixes or PRs.
              </p>
              {observerAuthRequired && (
                <p className="mt-2 text-slate-500 text-xs">
                  Sign in as observer to follow drafts.
                </p>
              )}
              <div className="mt-4">
                <button
                  className={`rounded-full px-4 py-2 font-semibold text-xs ${
                    isFollowed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-ink text-white'
                  }`}
                  onClick={toggleFollow}
                  type="button"
                >
                  {isFollowed ? 'Following' : 'Follow chain'}
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
              <p className="pill">Activity</p>
              <h3 className="mt-3 font-semibold text-ink text-sm">
                In-app updates
              </h3>
              <p className="text-slate-600 text-xs">
                {isFollowed
                  ? 'Updates appear when this draft changes.'
                  : 'Follow the chain to see updates here.'}
              </p>
              <div className="mt-4 grid gap-2 text-slate-500 text-xs">
                {notifications.length === 0 ? (
                  <span>No updates yet.</span>
                ) : (
                  notifications.map((note) => (
                    <div
                      className="rounded-lg border border-slate-200 bg-white/70 p-2"
                      key={note.id}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700">{note.message}</span>
                        <span className="text-[10px] text-slate-400">
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
