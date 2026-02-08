import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_RETRY_LOGS_DIR = 'artifacts/release/retry-failures';
const DEFAULT_RETRY_LOGS_TTL_DAYS = 14;
const DEFAULT_RETRY_LOGS_MAX_FILES = 200;
const DEFAULT_RETRY_LOGS_CLEANUP_ENABLED = true;
const DEFAULT_RETRY_LOGS_CLEANUP_DRY_RUN = false;

const RETRY_LOG_FILE_NAME_PATTERN = /^run-.*(?:\.log|-retry-metadata\.json)$/u;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const parseBoolean = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseInteger = (raw, fallback, allowZero = false) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (allowZero && parsed === 0) {
    return 0;
  }
  return parsed > 0 ? parsed : fallback;
};

export const resolveRetryLogsDir = (env = process.env) => {
  const configuredDir =
    env.RELEASE_TUNNEL_RETRY_LOGS_DIR ??
    env.RELEASE_RETRY_LOGS_DIR ??
    DEFAULT_RETRY_LOGS_DIR;
  const trimmed = configuredDir.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_RETRY_LOGS_DIR;
};

export const resolveRetryLogsCleanupConfig = (env = process.env) => {
  return {
    enabled: parseBoolean(
      env.RELEASE_RETRY_LOGS_CLEANUP_ENABLED,
      DEFAULT_RETRY_LOGS_CLEANUP_ENABLED,
    ),
    dryRun: parseBoolean(
      env.RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN,
      DEFAULT_RETRY_LOGS_CLEANUP_DRY_RUN,
    ),
    ttlDays: parseInteger(
      env.RELEASE_RETRY_LOGS_TTL_DAYS,
      DEFAULT_RETRY_LOGS_TTL_DAYS,
      true,
    ),
    maxFiles: parseInteger(
      env.RELEASE_RETRY_LOGS_MAX_FILES,
      DEFAULT_RETRY_LOGS_MAX_FILES,
      true,
    ),
  };
};

const isRetryLogsFile = (fileName) => RETRY_LOG_FILE_NAME_PATTERN.test(fileName);

export const cleanupRetryFailureLogs = async ({
  outputDir,
  enabled,
  dryRun,
  ttlDays,
  maxFiles,
  nowMs = Date.now(),
}) => {
  const cutoffMs = nowMs - ttlDays * DAY_IN_MS;
  const summary = {
    outputDir,
    enabled,
    dryRun,
    ttlDays,
    maxFiles,
    cutoffIso: new Date(cutoffMs).toISOString(),
    scannedFiles: 0,
    matchedFiles: 0,
    eligibleFiles: 0,
    ttlEligibleFiles: 0,
    maxFilesEligibleFiles: 0,
    keptFiles: 0,
    removedFiles: 0,
    removedBytes: 0,
    missingDirectory: false,
    skippedDisabled: false,
  };

  if (!enabled) {
    summary.skippedDisabled = true;
    return summary;
  }

  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      summary.missingDirectory = true;
      return summary;
    }
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    summary.scannedFiles += 1;

    const fileName = entry.name;
    if (!isRetryLogsFile(fileName)) {
      continue;
    }

    const filePath = path.join(outputDir, fileName);
    const fileStat = await stat(filePath);
    candidates.push({
      fileName,
      filePath,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  summary.matchedFiles = candidates.length;

  const filesToKeep = [];
  const filesToRemove = [];
  for (const candidate of candidates) {
    if (candidate.mtimeMs <= cutoffMs) {
      filesToRemove.push({ ...candidate, reason: 'ttl' });
      summary.ttlEligibleFiles += 1;
      continue;
    }
    filesToKeep.push(candidate);
  }

  if (filesToKeep.length > maxFiles) {
    const overflowCount = filesToKeep.length - maxFiles;
    const sorted = [...filesToKeep].sort((a, b) => {
      if (a.mtimeMs !== b.mtimeMs) {
        return a.mtimeMs - b.mtimeMs;
      }
      return a.fileName.localeCompare(b.fileName);
    });
    for (const staleCandidate of sorted.slice(0, overflowCount)) {
      filesToRemove.push({ ...staleCandidate, reason: 'max-files' });
      summary.maxFilesEligibleFiles += 1;
    }
  }

  summary.eligibleFiles = filesToRemove.length;
  for (const removable of filesToRemove) {
    summary.removedBytes += removable.size;
    if (!dryRun) {
      await unlink(removable.filePath);
    }
    summary.removedFiles += 1;
  }

  summary.keptFiles = summary.matchedFiles - summary.removedFiles;
  return summary;
};

export const formatRetryLogsCleanupSummary = ({ summary, label }) => {
  if (summary.skippedDisabled) {
    return `[${label}] retry logs cleanup skipped (disabled by RELEASE_RETRY_LOGS_CLEANUP_ENABLED).`;
  }

  if (summary.missingDirectory) {
    return `[${label}] retry logs cleanup skipped (directory not found: ${summary.outputDir}).`;
  }

  const action = summary.dryRun ? 'would remove' : 'removed';
  const bytesLabel = `${summary.removedBytes} bytes`;
  return `[${label}] retry logs cleanup ${action} ${summary.removedFiles}/${summary.eligibleFiles} eligible files (ttl: ${summary.ttlEligibleFiles}, max-files: ${summary.maxFilesEligibleFiles}); kept ${summary.keptFiles}/${summary.matchedFiles} matching files with max ${summary.maxFiles}; scanned ${summary.scannedFiles} files (${bytesLabel}).`;
};
