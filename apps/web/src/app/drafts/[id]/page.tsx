'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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

export default function DraftDetailPage({ params }: { params: { id: string } }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [fixRequests, setFixRequests] = useState<FixRequest[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [similarDrafts, setSimilarDrafts] = useState<SimilarDraft[]>([]);
  const [similarStatus, setSimilarStatus] = useState<string | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { events } = useRealtimeRoom(`post:${params.id}`);

  const loadDraft = async () => {
    const response = await apiClient.get(`/drafts/${params.id}`);
    setDraft(response.data.draft);
    setVersions(response.data.versions ?? []);
  };

  const loadFixRequests = async () => {
    const response = await apiClient.get(`/drafts/${params.id}/fix-requests`);
    setFixRequests(response.data ?? []);
  };

  const loadPullRequests = async () => {
    const response = await apiClient.get(`/drafts/${params.id}/pull-requests`);
    setPullRequests(response.data ?? []);
  };

  const loadSimilarDrafts = async () => {
    setSimilarLoading(true);
    setSimilarStatus(null);
    try {
      const response = await apiClient.get('/search/similar', {
        params: { draftId: params.id, limit: 6 }
      });
      const items = response.data ?? [];
      setSimilarDrafts(items);
      if (items.length === 0) {
        setSimilarStatus('No similar drafts yet.');
      }
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'EMBEDDING_NOT_FOUND') {
        setSimilarStatus('Similar works available after analysis.');
      } else if (code === 'DRAFT_NOT_FOUND') {
        setSimilarStatus('Draft not found.');
      } else {
        setSimilarStatus(err?.response?.data?.message ?? 'Failed to load similar drafts.');
      }
      setSimilarDrafts([]);
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
  }, [params.id]);

  useEffect(() => {
    loadSimilarDrafts();
  }, [params.id]);

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

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Draft Detail</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">Draft {params.id}</h2>
        <p className="text-sm text-slate-600">
          Track every critique and PR in real-time. {draft ? `GlowUp ${draft.glowUpScore.toFixed(1)}` : ''}
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Loading draft…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            <VersionTimeline versions={versionNumbers.length > 0 ? versionNumbers : [1]} />
            <BeforeAfterSlider
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
              beforeImageUrl={beforeImageUrl}
              afterImageUrl={afterImageUrl}
            />
            <FixRequestList items={fixList} />
            <PullRequestList items={prList} />
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
            </div>
          </div>
          <div className="grid gap-6">
            <HeatMapOverlay />
            <LivePanel scope={`post:${params.id}`} />
          </div>
        </div>
      )}
    </main>
  );
}
