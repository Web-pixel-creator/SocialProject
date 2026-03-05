import crypto from 'node:crypto';

export const RELEASE_CORRELATION_VALUE_PATTERN =
  /^[a-z0-9][a-z0-9._:-]{0,119}$/;

const normalizeScopeSegment = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, '-')
    .replace(/^[^a-z0-9]+/u, '')
    .replace(/[^a-z0-9]+$/u, '');
  return normalized || 'release';
};

const buildTimestampToken = (seedDate = new Date()) =>
  seedDate.toISOString().replace(/\D/gu, '').slice(0, 14);

const buildEntropyToken = () =>
  crypto.randomUUID().replace(/-/gu, '').slice(0, 10);

export const normalizeReleaseCorrelationValue = (
  value,
  {
    allowNull = true,
    fieldName = 'correlation value',
  } = {},
) => {
  if (value === undefined || value === null || value === '') {
    if (allowNull) {
      return null;
    }
    throw new Error(`${fieldName} is required.`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    if (allowNull) {
      return null;
    }
    throw new Error(`${fieldName} is required.`);
  }
  if (normalized.length > 120) {
    throw new Error(`${fieldName} must be at most 120 characters.`);
  }
  if (!RELEASE_CORRELATION_VALUE_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must use the expected identifier format.`);
  }
  return normalized;
};

export const normalizeReleaseCorrelationContext = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const normalized = {
    auditSessionId: normalizeReleaseCorrelationValue(value.auditSessionId, {
      fieldName: 'auditSessionId',
    }),
    correlationId: normalizeReleaseCorrelationValue(value.correlationId, {
      fieldName: 'correlationId',
    }),
    releaseRunId: normalizeReleaseCorrelationValue(value.releaseRunId, {
      fieldName: 'releaseRunId',
    }),
  };
  return Object.values(normalized).some((entry) => entry !== null)
    ? normalized
    : null;
};

export const createReleaseCorrelationContext = ({
  scope = 'release',
  seedDate = new Date(),
} = {}) => {
  const scopeToken = normalizeScopeSegment(scope);
  const stamp = buildTimestampToken(seedDate);
  const entropy = buildEntropyToken();
  const releaseRunId = `rel.${scopeToken}.${stamp}.${entropy}`;
  return {
    releaseRunId,
    correlationId: `${releaseRunId}.corr`,
    auditSessionId: `${releaseRunId}.audit`,
  };
};
