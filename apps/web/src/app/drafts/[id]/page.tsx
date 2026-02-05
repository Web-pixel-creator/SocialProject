'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiClient } from '../../../lib/api';
import { BeforeAfterSlider } from '../../../components/BeforeAfterSlider';
import { FixRequestList } from '../../../components/FixRequestList';
import { PullRequestList } from '../../../components/PullRequestList';
import { VersionTimeline } from '../../../components/VersionTimeline';
import { useRealtimeRoom } from '../../../hooks/useRealtimeRoom';

const HeatMapOverlay = dynamic(
  () => import('../../../components/HeatMapOverlay').then((mod) => mod.HeatMapOverlay),
  {
    ssr: false,
    loading: () => <div className="card p-4 text-sm text-slate-500">Loading heat map...</div>
  }
);
const LivePanel = dynamic(() => import('../../../components/LivePanel').then((mod) => mod.LivePanel), {
  ssr: false,
  loading: () => <div className="card p-4 text-sm text-slate-500">Loading live panel...</div>
});

type Draft = {
  id: string;
  currentVersion: number;
  glowUpScore: number;
  status: string;
  updatedAt: string;
};

type Version = {
  versionNumber: number;
  imageUrl: string;
};

type FixRequest = {
  id: string;
  category: string;
  description: string;
  criticId: string;
};

type PullRequest = {
  id: string;
  status: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  description: string;
  makerId: string;
};

type SimilarDraft = {
  id: string;
  title: string;
  score: number;
  glowUpScore: number;
  type: 'draft' | 'release';
};

const sendTelemetry = async (payload: Record<string, any>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
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
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; time: string }>>([]);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { events } = useRealtimeRoom(draftId ? `post:${draftId}` : 'post:unknown');

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
    try {
      const response = await apiClient.get('/search/similar', {
        params: { draftId, limit: 6 }
      });
      const items = response.data ?? [];
      setSimilarDrafts(items);
      if (items.length === 0) {
        setSimilarStatus('No similar drafts yet.');
        sendTelemetry({
          eventType: 'similar_search_empty',
          draftId,
          source: 'draft_detail',
          metadata: { reason: 'no_results' }
        });
      } else {
        sendTelemetry({
          eventType: 'similar_search_shown',
          draftId,
          source: 'draft_detail',
          metadata: { count: items.length }
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
        setSimilarStatus(err?.response?.data?.message ?? 'Failed to load similar drafts.');
      }
      setSimilarDrafts([]);
      sendTelemetry({
        eventType: 'similar_search_empty',
        draftId,
        source: 'draft_detail',
        metadata: { reason }
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
        await Promise.all([loadDraft(), loadFixRequests(), loadPullRequests()]);
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

  useEffect(() => {
    if (!draftId || typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem('followedDrafts');
    if (!raw) {
      setIsFollowed(false);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      setIsFollowed(list.includes(draftId));
    } catch {
      setIsFollowed(false);
    }
  }, [draftId]);

  const toggleFollow = () => {
    if (!draftId || typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem('followedDrafts');
    let list: string[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      } catch {
        list = [];
      }
    }
    const next = list.includes(draftId) ? list.filter((id) => id !== draftId) : [...list, draftId];
    window.localStorage.setItem('followedDrafts', JSON.stringify(next));
    const nextState = next.includes(draftId);
    setIsFollowed(nextState);
    sendTelemetry({
      eventType: nextState ? 'draft_follow' : 'draft_unfollow',
      draftId,
      source: 'draft_detail'
    });
  };

  useEffect(() => {
    loadSimilarDrafts();
  }, [draftId]);

  useEffect(() => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    if (['fix_request', 'pull_request', 'pull_request_decision'].includes(last.type)) {
      loadFixRequests();
      loadPullRequests();
    }
    if (last.type === 'glowup_update') {
      loadDraft();
    }
  }, [events.length]);

  const formatEventMessage = (eventType: string, payload: Record<string, unknown>) => {
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
    const fresh = events.filter((event) => !seenEventsRef.current.has(event.id));
    if (fresh.length === 0) return;
    const now = new Date().toLocaleTimeString();
    const next = fresh.map((event) => {
      seenEventsRef.current.add(event.id);
      return {
        id: event.id,
        message: formatEventMessage(event.type, event.payload),
        time: now
      };
    });
    setNotifications((prev) => [...next, ...prev].slice(0, 5));
  }, [events, isFollowed]);

  const versionNumbers = useMemo(() => versions.map((version) => version.versionNumber), [versions]);
  const beforeLabel = versionNumbers.length > 0 ? `v${versionNumbers[0]}` : 'v1';
  const afterLabel = versionNumbers.length > 0 ? `v${versionNumbers[versionNumbers.length - 1]}` : 'v1';
  const beforeImageUrl = versions.length > 0 ? versions[0].imageUrl : undefined;
  const afterImageUrl = versions.length > 0 ? versions[versions.length - 1].imageUrl : undefined;

  const fixList = fixRequests.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    critic: `Studio ${item.criticId.slice(0, 6)}`
  }));

  const prList = pullRequests.map((item) => ({
    id: item.id,
    status: item.status,
    description: item.description,
    maker: `Studio ${item.makerId.slice(0, 6)}`
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
        href: `/pull-requests/${pendingPull.id}`
      };
    }
    if (hasFixRequests) {
      return {
        title: 'Share draft for PR',
        description: 'Fix requests are ready. Share the draft ID to get a PR.',
        ctaLabel: copyStatus ?? 'Copy draft ID',
        onClick: copyDraftId
      };
    }
    return {
      title: 'Start critique',
      description: 'No fix requests yet. Run a demo flow to seed the workflow.',
      ctaLabel: demoLoading ? 'Running demo...' : 'Run demo flow',
      onClick: runDemoFlow
    };
  })();

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Draft Detail</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-ink">{draftId ? `Draft ${draftId}` : 'Draft'}</h2>
          {draft && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.tone}`}>
              {statusInfo.label}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Track every critique and PR in real-time. {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            onClick={runDemoFlow}
            disabled={demoLoading || !draftId}
          >
            {demoLoading ? 'Running demo...' : 'Run demo flow'}
          </button>
          {demoStatus && <span className="text-xs text-slate-500">{demoStatus}</span>}
        </div>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Loading draft…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            {nextAction && (
              <div className="card p-4">
                <p className="pill">Next best action</p>
                <h3 className="mt-3 text-lg font-semibold text-ink">{nextAction.title}</h3>
                <p className="text-sm text-slate-600">{nextAction.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {'href' in nextAction ? (
                    <Link
                      href={nextAction.href}
                      className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white"
                    >
                      {nextAction.ctaLabel}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      onClick={nextAction.onClick}
                      disabled={demoLoading && !hasFixRequests}
                    >
                      {nextAction.ctaLabel}
                    </button>
                  )}
                  {copyStatus && <span className="text-xs text-slate-500">{copyStatus}</span>}
                </div>
              </div>
            )}
            <VersionTimeline versions={versionNumbers.length > 0 ? versionNumbers : [1]} />
            <BeforeAfterSlider
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
              beforeImageUrl={beforeImageUrl}
              afterImageUrl={afterImageUrl}
            />
            <div id="fix-requests">
              <FixRequestList items={fixList} />
            </div>
            <div id="pull-requests">
              <PullRequestList items={prList} />
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Similar drafts</h3>
                <span className="text-xs text-slate-500">Visual match</span>
              </div>
              {similarLoading ? (
                <p className="mt-3 text-xs text-slate-500">Loading similar drafts...</p>
              ) : similarStatus ? (
                <p className="mt-3 text-xs text-slate-500">{similarStatus}</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {similarDrafts.map((item) => (
                    <li key={item.id} className="rounded-lg border border-slate-200 bg-white/70 p-3 text-xs">
                      <p className="text-[10px] uppercase text-slate-500">{item.type}</p>
                      <p className="text-sm text-ink">{item.title}</p>
                      <p className="text-[11px] text-slate-500">
                        Similarity {Number(item.score ?? 0).toFixed(2)} · GlowUp{' '}
                        {Number(item.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Link
                  href={
                    draftId
                      ? `/search?mode=visual&draftId=${draftId}&type=draft&from=similar`
                      : '/search?mode=visual&type=draft'
                  }
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:border-slate-300"
                  scroll={false}
                  onClick={() =>
                    sendTelemetry({
                      eventType: 'similar_search_clicked',
                      draftId,
                      source: 'draft_detail'
                    })
                  }
                >
                  See more similar
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-6">
            <HeatMapOverlay />
            <div className="card p-4">
              <p className="pill">Follow chain</p>
              <h3 className="mt-3 text-sm font-semibold text-ink">Track every change</h3>
              <p className="text-xs text-slate-600">
                Get notified in-app when this draft receives fixes or PRs.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    isFollowed ? 'bg-emerald-600 text-white' : 'bg-ink text-white'
                  }`}
                  onClick={toggleFollow}
                >
                  {isFollowed ? 'Following' : 'Follow chain'}
                </button>
              </div>
            </div>
            <div className="card p-4">
              <p className="pill">Activity</p>
              <h3 className="mt-3 text-sm font-semibold text-ink">In-app updates</h3>
              <p className="text-xs text-slate-600">
                {isFollowed ? 'Updates appear when this draft changes.' : 'Follow the chain to see updates here.'}
              </p>
              <div className="mt-4 grid gap-2 text-xs text-slate-500">
                {notifications.length === 0 ? (
                  <span>No updates yet.</span>
                ) : (
                  notifications.map((note) => (
                    <div key={note.id} className="rounded-lg border border-slate-200 bg-white/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700">{note.message}</span>
                        <span className="text-[10px] text-slate-400">{note.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <LivePanel scope={`post:${params.id}`} />
          </div>
        </div>
      )}
    </main>
  );
}
