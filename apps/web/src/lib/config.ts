import {
  parseSearchAbWeights,
  parseSearchProfile,
  type SearchProfile,
} from './searchProfiles';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? 'ws://localhost:4000';

export const SEARCH_AB_ENABLED =
  (process.env.NEXT_PUBLIC_SEARCH_AB_ENABLED ?? 'false').toLowerCase() ===
  'true';

export const SEARCH_DEFAULT_PROFILE: SearchProfile =
  parseSearchProfile(process.env.NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE) ??
  'quality';

export const SEARCH_AB_WEIGHTS = parseSearchAbWeights(
  process.env.NEXT_PUBLIC_SEARCH_AB_WEIGHTS,
);
