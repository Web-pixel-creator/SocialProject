export type SearchProfile = 'balanced' | 'quality' | 'novelty';

const PROFILE_ORDER: SearchProfile[] = ['balanced', 'quality', 'novelty'];

const DEFAULT_AB_WEIGHTS: Record<SearchProfile, number> = {
  balanced: 0.5,
  quality: 0.5,
  novelty: 0,
};

export const parseSearchProfile = (
  value?: string | null,
): SearchProfile | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'balanced' ||
    normalized === 'quality' ||
    normalized === 'novelty'
  ) {
    return normalized;
  }

  return null;
};

const hashToUnitInterval = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 2_147_483_647;
  }

  return hash / 2_147_483_647;
};

const normalizeWeights = (
  weights: Partial<Record<SearchProfile, number>>,
): Record<SearchProfile, number> => {
  const sanitized: Record<SearchProfile, number> = {
    balanced:
      Number.isFinite(weights.balanced) && (weights.balanced ?? 0) > 0
        ? Number(weights.balanced)
        : 0,
    quality:
      Number.isFinite(weights.quality) && (weights.quality ?? 0) > 0
        ? Number(weights.quality)
        : 0,
    novelty:
      Number.isFinite(weights.novelty) && (weights.novelty ?? 0) > 0
        ? Number(weights.novelty)
        : 0,
  };

  const sum = sanitized.balanced + sanitized.quality + sanitized.novelty;
  if (sum <= 0) {
    return DEFAULT_AB_WEIGHTS;
  }

  return {
    balanced: sanitized.balanced / sum,
    quality: sanitized.quality / sum,
    novelty: sanitized.novelty / sum,
  };
};

export const parseSearchAbWeights = (
  value?: string | null,
): Record<SearchProfile, number> => {
  if (!value?.trim()) {
    return DEFAULT_AB_WEIGHTS;
  }

  const parsed: Partial<Record<SearchProfile, number>> = {};
  const pairs = value.split(',');

  for (const pair of pairs) {
    const [rawProfile, rawWeight] = pair.split(':').map((item) => item.trim());
    const profile = parseSearchProfile(rawProfile);
    if (!profile) {
      continue;
    }

    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight < 0) {
      continue;
    }

    parsed[profile] = weight;
  }

  return normalizeWeights(parsed);
};

export const assignAbProfile = (
  seed: string,
  weights: Record<SearchProfile, number> = DEFAULT_AB_WEIGHTS,
): SearchProfile => {
  const normalized = normalizeWeights(weights);
  const roll = hashToUnitInterval(seed);
  let cumulative = 0;

  for (const profile of PROFILE_ORDER) {
    cumulative += normalized[profile];
    if (roll <= cumulative) {
      return profile;
    }
  }

  return 'balanced';
};

export const getDefaultSearchAbWeights = (): Record<SearchProfile, number> =>
  DEFAULT_AB_WEIGHTS;
