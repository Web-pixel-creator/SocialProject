import { parseReleaseBooleanEnv } from './release-env-parse-utils.mjs';

export const resolveProductionStringConfig = ({
  candidates,
  fallback = '',
}) => {
  const normalizedCandidates = Array.isArray(candidates) ? candidates : [];
  for (const candidate of normalizedCandidates) {
    const raw =
      candidate && typeof candidate === 'object' ? candidate.raw : undefined;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      continue;
    }
    const source =
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.source === 'string' &&
      candidate.source.trim().length > 0
        ? candidate.source.trim()
        : 'unknown';
    return {
      source,
      value: raw.trim(),
    };
  }
  return {
    source: 'unset',
    value: fallback,
  };
};

export const resolveProductionBooleanConfig = ({
  candidates,
  fallback = false,
}) => {
  const normalizedCandidates = Array.isArray(candidates) ? candidates : [];
  for (const candidate of normalizedCandidates) {
    const raw =
      candidate && typeof candidate === 'object' ? candidate.raw : undefined;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      continue;
    }
    const source =
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.source === 'string' &&
      candidate.source.trim().length > 0
        ? candidate.source.trim()
        : 'unknown';
    return {
      source,
      value: parseReleaseBooleanEnv(raw, fallback, source),
    };
  }
  return {
    source: 'unset',
    value: fallback,
  };
};
