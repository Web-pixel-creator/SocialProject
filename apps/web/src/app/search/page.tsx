'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import {
  SEARCH_AB_ENABLED,
  SEARCH_AB_WEIGHTS,
  SEARCH_DEFAULT_PROFILE,
} from '../../lib/config';
import {
  assignAbProfile,
  parseSearchProfile,
  type SearchProfile,
} from '../../lib/searchProfiles';

interface SearchResult {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
  glowUpScore?: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

const normalizeParams = (params: URLSearchParams) => {
  const entries = Array.from(params.entries()).sort(
    ([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) {
        return aValue.localeCompare(bValue);
      }
      return aKey.localeCompare(bKey);
    },
  );
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
};

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode =
    searchParams?.get('mode') === 'visual' ? 'visual' : 'text';
  const initialQuery = searchParams?.get('q') ?? '';
  const initialType = searchParams?.get('type') ?? 'all';
  const initialSort = searchParams?.get('sort') ?? 'recency';
  const initialRange = searchParams?.get('range') ?? 'all';
  const initialIntent = searchParams?.get('intent') ?? 'all';
  const initialDraftId = searchParams?.get('draftId') ?? '';
  const initialTags = searchParams?.get('tags') ?? '';
  const abRequested = searchParams?.get('ab') === '1';
  const abEnabled = abRequested && SEARCH_AB_ENABLED;

  const [mode, setMode] = useState<'text' | 'visual'>(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState(initialSort);
  const [range, setRange] = useState(initialRange);
  const [intent, setIntent] = useState(initialIntent);
  const [profile, setProfile] = useState<SearchProfile>(SEARCH_DEFAULT_PROFILE);
  const [visualDraftId, setVisualDraftId] = useState(initialDraftId);
  const [visualEmbedding, setVisualEmbedding] = useState('');
  const [visualTags, setVisualTags] = useState(initialTags);
  const [visualType, setVisualType] = useState(
    initialMode === 'visual' ? initialType : 'all',
  );
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [visualHasSearched, setVisualHasSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRunVisual = useRef(
    initialMode === 'visual' && initialDraftId.length > 0,
  );
  const searchKey = searchParams?.toString() ?? '';
  const didSmoothScroll = useRef(false);
  const resolveVisitorId = () => {
    if (typeof window === 'undefined') {
      return 'server';
    }

    const key = 'searchVisitorId';
    const stored = window.localStorage.getItem(key);
    if (stored) {
      return stored;
    }

    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, created);
    return created;
  };

  const sendTelemetry = async (payload: Record<string, any>) => {
    try {
      await apiClient.post('/telemetry/ux', payload);
    } catch (_error) {
      // ignore telemetry failures
    }
  };

  const pruneUndefined = <T extends Record<string, unknown>>(input: T) =>
    Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Partial<T>;

  useEffect(() => {
    if (!searchParams) {
      return;
    }
    const urlMode = searchParams.get('mode') === 'visual' ? 'visual' : 'text';
    const urlQuery = searchParams.get('q') ?? '';
    const urlType = searchParams.get('type') ?? 'all';
    const urlSort = searchParams.get('sort') ?? 'recency';
    const urlRange = searchParams.get('range') ?? 'all';
    const urlIntent = searchParams.get('intent') ?? 'all';
    const urlDraftId = searchParams.get('draftId') ?? '';
    const urlTags = searchParams.get('tags') ?? '';
    const urlProfile = searchParams.get('profile') ?? '';
    const urlAb = searchParams.get('ab') ?? '';
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
    if (urlIntent !== intent) {
      setIntent(urlIntent);
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
    const abMode = urlAb === '1' && SEARCH_AB_ENABLED;
    const storageKey = abMode ? 'searchAbProfile' : 'searchProfile';
    const storedProfile = parseSearchProfile(
      window.localStorage.getItem(storageKey),
    );
    const queryProfile = abMode ? null : parseSearchProfile(urlProfile);
    const assignedAbProfile = assignAbProfile(
      resolveVisitorId(),
      SEARCH_AB_WEIGHTS,
    );
    const nextProfile = abMode
      ? (storedProfile ?? assignedAbProfile)
      : (queryProfile ?? storedProfile ?? SEARCH_DEFAULT_PROFILE);
    if (nextProfile !== profile) {
      setProfile(nextProfile);
    }
    window.localStorage.setItem(storageKey, nextProfile);
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
    if (mode === 'text' && intent !== 'all') {
      params.set('intent', intent);
    }
    if (abEnabled) {
      params.set('ab', '1');
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams?.toString() ?? '';
    if (
      normalizeParams(params) ===
      normalizeParams(new URLSearchParams(currentQuery))
    ) {
      return;
    }
    router.replace(nextQuery ? `/search?${nextQuery}` : '/search', {
      scroll: false,
    });
  }, [
    mode,
    query,
    type,
    sort,
    range,
    intent,
    profile,
    visualDraftId,
    visualTags,
    visualType,
    abEnabled,
    router,
    searchParams,
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
          params: pruneUndefined({
            q: query,
            type: type === 'all' ? undefined : type,
            sort,
            range: range === 'all' ? undefined : range,
            intent: intent === 'all' ? undefined : intent,
            profile: profile === 'balanced' ? undefined : profile,
          }),
        });
        if (!cancelled) {
          setResults(response.data ?? []);
          sendTelemetry({
            eventType: 'search_performed',
            sort,
            status: type === 'all' ? undefined : type,
            range: range === 'all' ? undefined : range,
            intent: intent === 'all' ? undefined : intent,
            metadata: {
              profile,
              mode: 'text',
              queryLength: query.length,
              resultCount: Array.isArray(response.data)
                ? response.data.length
                : 0,
            },
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
  }, [mode, query, type, sort, range, intent, profile]);

  useEffect(() => {
    setResults([]);
    setError(null);
    setVisualNotice(null);
    setVisualHasSearched(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    if (type === 'studio' && intent !== 'all') {
      setIntent('all');
    }
  }, [mode, type, intent]);

  useEffect(() => {
    if (mode !== 'visual') {
      return;
    }
    setVisualHasSearched(false);
  }, [mode, visualDraftId, visualEmbedding, visualTags, visualType]);

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
    if (!(embedding || trimmedDraftId)) {
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
        tags: tags.length > 0 ? tags : undefined,
      });
      setResults(response.data ?? []);
      setVisualHasSearched(true);
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
      source: 'search_prefill',
      metadata: { mode: 'visual', profile },
    });
    runVisualSearch();
  }, [mode, profile, visualDraftId]);

  const summary =
    mode === 'text'
      ? `Results for "${query || '...'}" | type ${type} | intent ${intent} | sorted by ${sort} | range ${range}`
      : `Visual results | type ${visualType}${
          visualDraftId.trim() ? ` | draft ${visualDraftId.trim()}` : ''
        }${visualTags.trim() ? ` | tags ${visualTags.trim()}` : ''}`;
  const showAbBadge = abEnabled;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">Search</h2>
        <p className="text-slate-600 text-sm">
          Find drafts, releases, and studios.
        </p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'text'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setMode('text')}
            type="button"
          >
            Text search
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'visual'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setMode('visual')}
            type="button"
          >
            Visual search
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by keyword"
              value={query}
            />
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                <option value="all">All types</option>
                <option value="draft">Drafts</option>
                <option value="release">Releases</option>
                <option value="studio">Studios</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={type === 'studio'}
                onChange={(event) => setIntent(event.target.value)}
                value={intent}
              >
                <option value="all">All intents</option>
                <option value="needs_help">Needs help</option>
                <option value="seeking_pr">Seeking PR</option>
                <option value="ready_for_review">Ready for review</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                onChange={(event) => setSort(event.target.value)}
                value={sort}
              >
                <option value="relevance">Relevance</option>
                <option value="recency">Recency</option>
                <option value="glowup">GlowUp</option>
                <option value="impact">Impact</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                onChange={(event) => setRange(event.target.value)}
                value={range}
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
              onChange={(event) => setVisualDraftId(event.target.value)}
              placeholder="Draft ID (optional)"
              value={visualDraftId}
            />
            <textarea
              className="min-h-[120px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
              onChange={(event) => setVisualEmbedding(event.target.value)}
              placeholder="Embedding (JSON array, e.g. [0.1, 0.2, 0.3])"
              value={visualEmbedding}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              onChange={(event) => setVisualTags(event.target.value)}
              placeholder="Style tags (comma separated)"
              value={visualTags}
            />
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                onChange={(event) => setVisualType(event.target.value)}
                value={visualType}
              >
                <option value="all">All types</option>
                <option value="draft">Drafts</option>
                <option value="release">Releases</option>
              </select>
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={loading}
                onClick={runVisualSearch}
                type="button"
              >
                Run visual search
              </button>
            </div>
            <p className="text-slate-500 text-xs">
              Provide either a draft ID or an embedding array.
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 border-dashed bg-white/70 p-4 text-slate-500 text-sm">
          <span>{summary}</span>
          {showAbBadge && (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 uppercase">
              AB {profile}
            </span>
          )}
        </div>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-600 text-xs">
            {error}
          </div>
        )}
        {visualNotice && (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-slate-500 text-xs">
            {visualNotice}
          </div>
        )}
        {mode === 'visual' &&
          visualHasSearched &&
          results.length === 0 &&
          !error &&
          !visualNotice &&
          !loading && (
            <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-slate-500 text-xs">
              Search completed, no results.
            </div>
          )}
        {loading ? (
          <p className="text-slate-500 text-xs">Searching...</p>
        ) : (
          <ul className="grid gap-3">
            {results.map((result, index) => {
              const href =
                result.type === 'studio'
                  ? `/studios/${result.id}`
                  : `/drafts/${result.id}`;
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
                    rank: index + 1,
                  },
                });
              };

              return (
                <li
                  className="rounded-xl border border-slate-200 bg-white/70 text-sm"
                  key={result.id}
                >
                  <Link
                    className="block rounded-xl p-3 transition hover:bg-white hover:shadow-sm"
                    href={href}
                    onClick={handleOpen}
                  >
                    <p className="font-semibold text-slate-500 text-xs uppercase">
                      {result.type}
                    </p>
                    <p className="text-ink text-sm">{result.title}</p>
                    {result.type !== 'studio' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {result.beforeImageUrl ? (
                          <Image
                            alt="Before preview"
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.beforeImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg bg-slate-100 font-semibold text-[11px] text-slate-400">
                            Before
                          </div>
                        )}
                        {result.afterImageUrl ? (
                          <Image
                            alt="After preview"
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.afterImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg bg-slate-100 font-semibold text-[11px] text-slate-400">
                            After
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-slate-500 text-xs">
                      Score {Number(result.score ?? 0).toFixed(1)}
                    </p>
                    {typeof result.glowUpScore === 'number' && (
                      <p className="text-slate-500 text-xs">
                        GlowUp {Number(result.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="text-slate-500 text-xs">No results yet.</li>
            )}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="card p-6 text-slate-500 text-sm">
          Loading search...
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
