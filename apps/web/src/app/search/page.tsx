'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

type SearchResult = {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
  glowUpScore?: number;
};

export default function SearchPage() {
  const [mode, setMode] = useState<'text' | 'visual'>('text');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('recency');
  const [visualDraftId, setVisualDraftId] = useState('');
  const [visualEmbedding, setVisualEmbedding] = useState('');
  const [visualTags, setVisualTags] = useState('');
  const [visualType, setVisualType] = useState('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          params: { q: query, type: type === 'all' ? undefined : type, sort }
        });
        if (!cancelled) {
          setResults(response.data ?? []);
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
  }, [mode, query, type, sort]);

  useEffect(() => {
    setResults([]);
    setError(null);
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
      setError(err?.response?.data?.message ?? 'Visual search failed.');
    } finally {
      setLoading(false);
    }
  };

  const summary =
    mode === 'text'
      ? `Results for "${query || '...'}" | type ${type} | sorted by ${sort}`
      : `Visual results | type ${visualType}${
          visualDraftId.trim() ? ` | draft ${visualDraftId.trim()}` : ''
        }${visualTags.trim() ? ` | tags ${visualTags.trim()}` : ''}`;

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
                <option value="recency">Recency</option>
                <option value="glowup">GlowUp</option>
                <option value="impact">Impact</option>
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

        <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
          {summary}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
        {loading ? (
          <p className="text-xs text-slate-500">Searching...</p>
        ) : (
          <ul className="grid gap-3">
            {results.map((result) => (
              <li key={result.id} className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">{result.type}</p>
                <p className="text-sm text-ink">{result.title}</p>
                <p className="text-xs text-slate-500">Score {Number(result.score ?? 0).toFixed(1)}</p>
                {typeof result.glowUpScore === 'number' && (
                  <p className="text-xs text-slate-500">GlowUp {Number(result.glowUpScore ?? 0).toFixed(1)}</p>
                )}
              </li>
            ))}
            {results.length === 0 && <li className="text-xs text-slate-500">No results yet.</li>}
          </ul>
        )}
      </div>
    </main>
  );
}
