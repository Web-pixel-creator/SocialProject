const DEFAULT_MAX_ARRAY_ITEMS = 10;

const resolveMaxArrayItems = (value) => {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return DEFAULT_MAX_ARRAY_ITEMS;
};

const truncateArrays = (value, maxArrayItems) => {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => truncateArrays(entry, maxArrayItems));
    if (normalized.length <= maxArrayItems) {
      return normalized;
    }
    const overflowCount = normalized.length - maxArrayItems;
    return [
      ...normalized.slice(0, maxArrayItems),
      `+${overflowCount} more`,
    ];
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = truncateArrays(entry, maxArrayItems);
  }
  return out;
};

export const buildProductionLaunchGateFailureLines = ({
  checks,
  error,
  maxArrayItems,
}) => {
  const maxItems = resolveMaxArrayItems(maxArrayItems);
  const normalizedChecks =
    checks && typeof checks === 'object' ? checks : {};
  const failedChecks = Object.entries(normalizedChecks).filter(([, value]) => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    return value.pass !== true;
  });

  const lines = [];
  if (failedChecks.length > 0) {
    lines.push(`Failed checks (${failedChecks.length}):`);
    for (const [checkName, checkValue] of failedChecks) {
      const compactDetails = truncateArrays(checkValue, maxItems);
      lines.push(`- ${checkName}`);
      lines.push(`  details: ${JSON.stringify(compactDetails)}`);
    }
  } else {
    lines.push('No failed checks captured.');
  }

  const errorMessage =
    error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : '';
  if (errorMessage) {
    lines.push(`Error: ${errorMessage}`);
  }

  return lines;
};
