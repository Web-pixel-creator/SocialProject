import type { DbClient } from '../auth/types';

export type SearchType = 'draft' | 'release' | 'studio' | 'all';
export type SearchSort = 'glowup' | 'recency' | 'impact';

export type SearchFilters = {
  type?: SearchType;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  type: 'draft' | 'release' | 'studio';
  id: string;
  title: string;
  score: number;
};

export type SearchService = {
  search(query: string, filters: SearchFilters, client?: DbClient): Promise<SearchResult[]>;
};
