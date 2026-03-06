import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LAST_KNOWN_GOOD_CONFIG_FORMAT_VERSION = 1;

const sortDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortDeep(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortDeep(value[key]);
  }
  return out;
};

const createSnapshotHash = (value) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(sortDeep(value)))
    .digest('hex');

const readJsonIfExists = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createLastKnownGoodConfigError = (code, message, details) =>
  Object.assign(new Error(message), { code, details });

export const toLastKnownGoodConfigErrorPayload = (error) => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const code =
    typeof error.code === 'string' && error.code.trim().length > 0
      ? error.code.trim()
      : '';
  return {
    code,
    details:
      error.details && typeof error.details === 'object' ? error.details : null,
    message: error instanceof Error ? error.message : String(error),
  };
};

export const resolveLastKnownGoodConfig = async ({
  candidateSnapshot,
  resolutionPath,
  scope,
  snapshotPath,
  validateSnapshot,
}) => {
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    throw new Error('scope is required for last-known-good config resolution.');
  }
  if (typeof snapshotPath !== 'string' || snapshotPath.trim().length === 0) {
    throw new Error(
      'snapshotPath is required for last-known-good config resolution.',
    );
  }
  if (typeof resolutionPath !== 'string' || resolutionPath.trim().length === 0) {
    throw new Error(
      'resolutionPath is required for last-known-good config resolution.',
    );
  }
  if (typeof validateSnapshot !== 'function') {
    throw new Error(
      'validateSnapshot must be a function for last-known-good config resolution.',
    );
  }

  const generatedAtUtc = new Date().toISOString();
  const resolution = {
    active: null,
    candidate: {
      error: null,
      hash: createSnapshotHash(candidateSnapshot),
      snapshot: candidateSnapshot,
      valid: false,
    },
    fallback: {
      reason: null,
      used: false,
    },
    formatVersion: LAST_KNOWN_GOOD_CONFIG_FORMAT_VERSION,
    generatedAtUtc,
    lastKnownGood: {
      available: false,
      error: null,
      hash: null,
      savedAtUtc: null,
      valid: false,
    },
    resolutionPath,
    scope: scope.trim(),
    snapshotPath,
  };

  let validatedCandidateSnapshot = null;
  try {
    validatedCandidateSnapshot = validateSnapshot(candidateSnapshot);
    resolution.candidate.valid = true;
  } catch (error) {
    resolution.candidate.error =
      error instanceof Error ? error.message : String(error);
  }

  if (resolution.candidate.valid) {
    const snapshotRecord = {
      formatVersion: LAST_KNOWN_GOOD_CONFIG_FORMAT_VERSION,
      savedAtUtc: generatedAtUtc,
      scope: scope.trim(),
      snapshot: candidateSnapshot,
      snapshotHash: resolution.candidate.hash,
    };
    await writeJson(snapshotPath, snapshotRecord);
    resolution.active = {
      hash: snapshotRecord.snapshotHash,
      savedAtUtc: snapshotRecord.savedAtUtc,
      source: 'candidate',
    };
    await writeJson(resolutionPath, resolution);
    return {
      activeSnapshot: candidateSnapshot,
      resolution,
      snapshotRecord,
      validatedActiveSnapshot: validatedCandidateSnapshot,
    };
  }

  const lastKnownGoodRecord = await readJsonIfExists(snapshotPath);
  if (lastKnownGoodRecord) {
    resolution.lastKnownGood.available = true;
    resolution.lastKnownGood.hash =
      typeof lastKnownGoodRecord.snapshotHash === 'string'
        ? lastKnownGoodRecord.snapshotHash
        : null;
    resolution.lastKnownGood.savedAtUtc =
      typeof lastKnownGoodRecord.savedAtUtc === 'string'
        ? lastKnownGoodRecord.savedAtUtc
        : null;
    try {
      const validatedActiveSnapshot = validateSnapshot(lastKnownGoodRecord.snapshot);
      resolution.lastKnownGood.valid = true;
      resolution.fallback.reason =
        resolution.candidate.error || 'candidate snapshot validation failed';
      resolution.fallback.used = true;
      resolution.active = {
        hash:
          resolution.lastKnownGood.hash ||
          createSnapshotHash(lastKnownGoodRecord.snapshot),
        savedAtUtc: resolution.lastKnownGood.savedAtUtc,
        source: 'last_known_good',
      };
      await writeJson(resolutionPath, resolution);
      return {
        activeSnapshot: lastKnownGoodRecord.snapshot,
        resolution,
        snapshotRecord: lastKnownGoodRecord,
        validatedActiveSnapshot,
      };
    } catch (error) {
      resolution.lastKnownGood.error =
        error instanceof Error ? error.message : String(error);
    }
  }

  await writeJson(resolutionPath, resolution);
  throw createLastKnownGoodConfigError(
    'RELEASE_LAST_KNOWN_GOOD_CONFIG_UNAVAILABLE',
    `No valid config snapshot available for ${scope.trim()}.`,
    {
      resolution,
    },
  );
};
