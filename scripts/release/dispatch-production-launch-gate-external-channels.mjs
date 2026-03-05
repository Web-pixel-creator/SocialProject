export const ALLOWED_EXTERNAL_CHANNELS = ['telegram', 'slack', 'discord'];

const parseNormalizedExternalChannels = (raw, sourceLabel) => {
  if (typeof raw !== 'string') return '';
  const normalized = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (normalized.length === 0) return '';
  if (normalized.includes('all')) return 'all';
  const invalid = normalized.filter(
    (entry) => !ALLOWED_EXTERNAL_CHANNELS.includes(entry),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${sourceLabel} contains unsupported channels: ${invalid.join(', ')}. Allowed: ${ALLOWED_EXTERNAL_CHANNELS.join(', ')} or all.`,
    );
  }
  return [...new Set(normalized)];
};

export const parseDispatchExternalChannels = (raw, sourceLabel) => {
  const normalized = parseNormalizedExternalChannels(raw, sourceLabel);
  if (normalized === '' || normalized === 'all') {
    return normalized;
  }
  return normalized.join(',');
};

export const parseExternalChannelsList = (raw, sourceLabel) => {
  const normalized = parseNormalizedExternalChannels(raw, sourceLabel);
  if (normalized === '') {
    return [];
  }
  if (normalized === 'all') {
    return [...ALLOWED_EXTERNAL_CHANNELS];
  }
  return normalized;
};
