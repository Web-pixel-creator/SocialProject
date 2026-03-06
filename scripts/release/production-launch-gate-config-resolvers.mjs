import { parseReleaseBooleanEnv } from './release-env-parse-utils.mjs';

export const resolveProductionRawConfig = ({
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
    value: typeof fallback === 'string' ? fallback : String(fallback ?? ''),
  };
};

export const resolveProductionStringConfig = ({
  candidates,
  fallback = '',
}) => resolveProductionRawConfig({ candidates, fallback });

export const resolveProductionBooleanConfig = ({
  candidates,
  fallback = false,
}) => {
  const resolved = resolveProductionRawConfig({
    candidates,
    fallback: '',
  });
  if (resolved.source === 'unset' && resolved.value.length === 0) {
    return {
      source: 'unset',
      value: fallback,
    };
  }
  return {
    source: resolved.source,
    value: parseReleaseBooleanEnv(resolved.value, fallback, resolved.source),
  };
};
