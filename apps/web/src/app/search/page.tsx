'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

type SearchResult = {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('recency');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [query, type, sort]);

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold text-ink">Search</h2>
        <p className="text-sm text-slate-600">Find drafts, releases, and studios.</p>
      </div>
      <div className="card grid gap-4 p-6">
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
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
          Results for "{query || '...'}" · type {type} · sorted by {sort}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
        {loading ? (
          <p className="text-xs text-slate-500">Searching…</p>
        ) : (
          <ul className="grid gap-3">
            {results.map((result) => (
              <li key={result.id} className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">{result.type}</p>
                <p className="text-sm text-ink">{result.title}</p>
                <p className="text-xs text-slate-500">Score {Number(result.score ?? 0).toFixed(1)}</p>
              </li>
            ))}
            {results.length === 0 && <li className="text-xs text-slate-500">No results yet.</li>}
          </ul>
        )}
      </div>
    </main>
  );
}
