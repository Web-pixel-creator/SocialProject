'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../lib/api';

type SearchResult = {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
  glowUpScore?: number;
};

const normalizeParams = (params: URLSearchParams) => {
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) {
      return aValue.localeCompare(bValue);
    }
    return aKey.localeCompare(bKey);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode = searchParams?.get('mode') === 'visual' ? 'visual' : 'text';
  const initialQuery = searchParams?.get('q') ?? '';
  const initialType = searchParams?.get('type') ?? 'all';
  const initialSort = searchParams?.get('sort') ?? 'recency';
  const initialRange = searchParams?.get('range') ?? 'all';
  const initialDraftId = searchParams?.get('draftId') ?? '';
  const initialTags = searchParams?.get('tags') ?? '';
  const initialProfileParam = searchParams?.get('profile') ?? '';
  const initialFrom = searchParams?.get('from') ?? '';

  const [mode, setMode] = useState<'text' | 'visual'>(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState(initialSort);
  const [range, setRange] = useState(initialRange);
  const [profile, setProfile] = useState<'balanced' | 'quality' | 'novelty'>('balanced');
  const [visualDraftId, setVisualDraftId] = useState(initialDraftId);
  const [visualEmbedding, setVisualEmbedding] = useState('');
  const [visualTags, setVisualTags] = useState(initialTags);
  const [visualType, setVisualType] = useState(initialMode === 'visual' ? initialType : 'all');
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRunVisual = useRef(initialMode === 'visual' && initialDraftId.length > 0);
  const searchKey = searchParams?.toString() ?? '';
  const didSmoothScroll = useRef(false);

  const sendTelemetry = async (payload: Record<string, any>) => {
    try {
      await apiClient.post('/telemetry/ux', payload);
    } catch (_error) {
      // ignore telemetry failures
    }
  };

  useEffect(() => {
    if (!searchParams) {
      return;
    }
    const urlMode = searchParams.get('mode') === 'visual' ? 'visual' : 'text';
    const urlQuery = searchParams.get('q') ?? '';
    const urlType = searchParams.get('type') ?? 'all';
    const urlSort = searchParams.get('sort') ?? 'recency';
    const urlRange = searchParams.get('range') ?? 'all';
    const urlDraftId = searchParams.get('draftId') ?? '';
    const urlTags = searchParams.get('tags') ?? '';
    const urlProfile = searchParams.get('profile') ?? '';
    const urlFrom = searchParams.get('from') ?? '';

    if (urlMode !== mode) {
      setMode(urlMode);
    }
    if (urlQuery !== query) {
      setQuery(urlQuery);
    }
    if (urlType !== type) {
      setType(urlType);
    }
    if (urlMode === 'visual' && urlType !== visualType) {
      setVisualType(urlType);
    }
    if (urlSort !== sort) {
      setSort(urlSort);
    }
    if (urlRange !== range) {
      setRange(urlRange);
    }
    if (urlDraftId !== visualDraftId) {
      setVisualDraftId(urlDraftId);
    }
    if (urlTags !== visualTags) {
      setVisualTags(urlTags);
    }

    if (urlFrom === 'similar' && !didSmoothScroll.current) {
      didSmoothScroll.current = true;
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    if (urlMode === 'visual' && urlDraftId.trim().length > 0) {
      autoRunVisual.current = true;
    }

    if (typeof window === 'undefined') {
      return;
    }
    const validProfiles = new Set(['balanced', 'quality', 'novelty']);
    const stored = window.localStorage.getItem('searchProfile') ?? '';
    const queryProfile = validProfiles.has(urlProfile) ? urlProfile : '';
    const storedProfile = validProfiles.has(stored) ? stored : '';
    const nextProfile = queryProfile || storedProfile || 'balanced';
    if (nextProfile !== profile) {
      setProfile(nextProfile as 'balanced' | 'quality' | 'novelty');
    }
    window.localStorage.setItem('searchProfile', nextProfile);
  }, [searchKey]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === 'visual') {
      params.set('mode', 'visual');
    }
    if (mode === 'text' && query.trim()) {
      params.set('q', query.trim());
    }
    const effectiveType = mode === 'visual' ? visualType : type;
    if (effectiveType !== 'all') {
      params.set('type', effectiveType);
    }
    if (mode === 'text' && sort !== 'recency') {
      params.set('sort', sort);
    }
    if (mode === 'text' && range !== 'all') {
      params.set('range', range);
    }
    if (mode === 'visual' && visualDraftId.trim()) {
      params.set('draftId', visualDraftId.trim());
    }
    if (mode === 'visual' && visualTags.trim()) {
      params.set('tags', visualTags.trim());
    }
    if (searchParams?.get('from') === 'similar') {
      params.set('from', 'similar');
    }
    if (profile !== 'balanced') {
      params.set('profile', profile);
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams?.toString() ?? '';
    if (normalizeParams(params) === normalizeParams(new URLSearchParams(currentQuery))) {
      return;
    }
    router.replace(nextQuery ? `/search?${nextQuery}` : '/search', { scroll: false });
  }, [
    mode,
    query,
    type,
    sort,
    range,
    profile,
    visualDraftId,
    visualTags,
    visualType,
    router,
    searchParams
  ]);

  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/search', {
          params: {
            q: query,
            type: type === 'all' ? undefined : type,
            sort,
            range: range === 'all' ? undefined : range,
            profile: profile === 'balanced' ? undefined : profile
          }
        });
        if (!cancelled) {
          setResults(response.data ?? []);
          sendTelemetry({
            eventType: 'search_performed',
            sort,
            status: type === 'all' ? undefined : type,
            range: range === 'all' ? undefined : range,
            metadata: {
              profile,
              mode: 'text',
              queryLength: query.length,
              resultCount: Array.isArray(response.data) ? response.data.length : 0
            }
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message ?? 'Search failed.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mode, query, type, sort, range, profile]);

  useEffect(() => {
    setResults([]);
    setError(null);
    setVisualNotice(null);
  }, [mode]);

  const parseEmbedding = (value: string) => {
    if (!value.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return null;
      }
      const normalized = parsed
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  };

  const parseTags = (value: string) =>
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

  const runVisualSearch = async () => {
    const embedding = parseEmbedding(visualEmbedding);
    const trimmedDraftId = visualDraftId.trim();
    if (!embedding && !trimmedDraftId) {
      setError('Provide a draft ID or an embedding array.');
      return;
    }
    setLoading(true);
    setError(null);
    setVisualNotice(null);
    try {
      const tags = parseTags(visualTags);
      const response = await apiClient.post('/search/visual', {
        embedding: embedding ?? undefined,
        draftId: trimmedDraftId || undefined,
        type: visualType === 'all' ? undefined : visualType,
        tags: tags.length > 0 ? tags : undefined
      });
      setResults(response.data ?? []);
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'EMBEDDING_NOT_FOUND') {
        setResults([]);
        setVisualNotice('Similar works available after analysis.');
      } else {
        setError(err?.response?.data?.message ?? 'Visual search failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'visual') {
      return;
    }
    if (!autoRunVisual.current) {
      return;
    }
    if (!visualDraftId.trim()) {
      return;
    }
    autoRunVisual.current = false;
    sendTelemetry({
      eventType: 'similar_search_view',
      draftId: visualDraftId.trim(),
      source: 'search_prefill'
    });
    void runVisualSearch();
  }, [mode, visualDraftId]);

  const summary =
    mode === 'text'
      ? `Results for "${query || '...'}" | type ${type} | sorted by ${sort} | range ${range}`
      : `Visual results | type ${visualType}${
          visualDraftId.trim() ? ` | draft ${visualDraftId.trim()}` : ''
        }${visualTags.trim() ? ` | tags ${visualTags.trim()}` : ''}`;
  const showAbBadge = false;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold text-ink">Search</h2>
        <p className="text-sm text-slate-600">Find drafts, releases, and studios.</p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'text' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setMode('text')}
          >
            Text search
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'visual' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setMode('visual')}
          >
            Visual search
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              placeholder="Search by keyword"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="draft">Drafts</option>
                <option value="release">Releases</option>
                <option value="studio">Studios</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="relevance">Relevance</option>
                <option value="recency">Recency</option>
                <option value="glowup">GlowUp</option>
                <option value="impact">Impact</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={range}
                onChange={(event) => setRange(event.target.value)}
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              placeholder="Draft ID (optional)"
              value={visualDraftId}
              onChange={(event) => setVisualDraftId(event.target.value)}
            />
            <textarea
              className="min-h-[120px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
              placeholder="Embedding (JSON array, e.g. [0.1, 0.2, 0.3])"
              value={visualEmbedding}
              onChange={(event) => setVisualEmbedding(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              placeholder="Style tags (comma separated)"
              value={visualTags}
              onChange={(event) => setVisualTags(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={visualType}
                onChange={(event) => setVisualType(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="draft">Drafts</option>
                <option value="release">Releases</option>
              </select>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={runVisualSearch}
                disabled={loading}
              >
                Run visual search
              </button>
            </div>
            <p className="text-xs text-slate-500">Provide either a draft ID or an embedding array.</p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
          <span>{summary}</span>
          {showAbBadge && (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] uppercase text-slate-500">
              AB {profile}
            </span>
          )}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
        {visualNotice && (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
            {visualNotice}
          </div>
        )}
        {loading ? (
          <p className="text-xs text-slate-500">Searching...</p>
        ) : (
          <ul className="grid gap-3">
            {results.map((result, index) => {
              const href = result.type === 'studio' ? `/studios/${result.id}` : `/drafts/${result.id}`;
              const handleOpen = () => {
                sendTelemetry({
                  eventType: 'search_result_open',
                  draftId: result.type === 'studio' ? undefined : result.id,
                  sort: mode === 'text' ? sort : undefined,
                  status: mode === 'text' && type !== 'all' ? type : undefined,
                  range: mode === 'text' && range !== 'all' ? range : undefined,
                  metadata: {
                    mode,
                    profile: mode === 'text' ? profile : undefined,
                    resultType: result.type,
                    resultId: result.id,
                    queryLength: mode === 'text' ? query.length : 0,
                    rank: index + 1
                  }
                });
              };

              return (
                <li key={result.id} className="rounded-xl border border-slate-200 bg-white/70 text-sm">
                  <Link
                    href={href}
                    onClick={handleOpen}
                    className="block rounded-xl p-3 transition hover:bg-white hover:shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase text-slate-500">{result.type}</p>
                    <p className="text-sm text-ink">{result.title}</p>
                    <p className="text-xs text-slate-500">Score {Number(result.score ?? 0).toFixed(1)}</p>
                    {typeof result.glowUpScore === 'number' && (
                      <p className="text-xs text-slate-500">GlowUp {Number(result.glowUpScore ?? 0).toFixed(1)}</p>
                    )}
                  </Link>
                </li>
              );
            })}
            {results.length === 0 && <li className="text-xs text-slate-500">No results yet.</li>}
          </ul>
        )}
      </div>
    </main>
  );
}
