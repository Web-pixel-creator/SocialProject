const BOOLEAN_TRUE_VALUES = ['1', 'true', 'yes', 'y'];
const BOOLEAN_FALSE_VALUES = ['0', 'false', 'no', 'n'];

export const parseReleaseBooleanEnv = (raw, fallback, sourceLabel) => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.includes(normalized)) return true;
  if (BOOLEAN_FALSE_VALUES.includes(normalized)) return false;
  throw new Error(
    `Invalid value for ${sourceLabel}: ${raw.trim()}. Expected boolean true/false (accepted: 1,0,yes,no,y,n).`,
  );
};

export const parseReleasePositiveIntegerEnv = (raw, fallback, sourceLabel) => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const value = raw.trim();
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || `${parsed}` !== value) {
    throw new Error(
      `Invalid value for ${sourceLabel}: ${value}. Expected a positive integer.`,
    );
  }
  return parsed;
};
