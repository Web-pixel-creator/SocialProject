import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_RETRY_LOGS_DIR = 'artifacts/release/retry-failures';
const DEFAULT_RETRY_LOGS_TTL_DAYS = 14;
const DEFAULT_RETRY_LOGS_MAX_RUNS = 100;
const DEFAULT_RETRY_LOGS_MAX_FILES = 200;
const DEFAULT_RETRY_LOGS_CLEANUP_ENABLED = true;
const DEFAULT_RETRY_LOGS_CLEANUP_DRY_RUN = false;

const RETRY_LOG_FILE_NAME_PATTERN = /^run-.*(?:\.log|-retry-metadata\.json)$/u;
const RETRY_LOG_RUN_ID_PATTERN = /runid-(\d+)/u;
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
    maxRuns: parseInteger(
      env.RELEASE_RETRY_LOGS_MAX_RUNS,
      DEFAULT_RETRY_LOGS_MAX_RUNS,
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
const getRunKeyForFile = (fileName) => {
  const match = fileName.match(RETRY_LOG_RUN_ID_PATTERN);
  if (!match) {
    return `file:${fileName}`;
  }
  return `runid:${match[1]}`;
};

export const cleanupRetryFailureLogs = async ({
  outputDir,
  enabled,
  dryRun,
  ttlDays,
  maxRuns,
  maxFiles,
  nowMs = Date.now(),
}) => {
  const cutoffMs = nowMs - ttlDays * DAY_IN_MS;
  const summary = {
    outputDir,
    enabled,
    dryRun,
    ttlDays,
    maxRuns,
    maxFiles,
    cutoffIso: new Date(cutoffMs).toISOString(),
    scannedFiles: 0,
    matchedFiles: 0,
    matchedRuns: 0,
    eligibleFiles: 0,
    eligibleRuns: 0,
    ttlEligibleFiles: 0,
    ttlEligibleRuns: 0,
    maxRunsEligibleFiles: 0,
    maxRunsEligibleRuns: 0,
    maxFilesEligibleFiles: 0,
    maxFilesEligibleRuns: 0,
    keptFiles: 0,
    keptRuns: 0,
    removedFiles: 0,
    removedRuns: 0,
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

  const groupsByRun = new Map();
  for (const candidate of candidates) {
    const runKey = getRunKeyForFile(candidate.fileName);
    const existingGroup = groupsByRun.get(runKey);
    if (existingGroup) {
      existingGroup.files.push(candidate);
      existingGroup.totalSize += candidate.size;
      existingGroup.oldestMtimeMs = Math.min(
        existingGroup.oldestMtimeMs,
        candidate.mtimeMs,
      );
      existingGroup.newestMtimeMs = Math.max(
        existingGroup.newestMtimeMs,
        candidate.mtimeMs,
      );
      continue;
    }

    groupsByRun.set(runKey, {
      runKey,
      files: [candidate],
      totalSize: candidate.size,
      oldestMtimeMs: candidate.mtimeMs,
      newestMtimeMs: candidate.mtimeMs,
    });
  }
  const runGroups = [...groupsByRun.values()];
  summary.matchedRuns = runGroups.length;

  const runsToKeep = [];
  const runsToRemove = [];
  const markRunForRemoval = (group, reason) => {
    runsToRemove.push({
      ...group,
      reason,
    });
    summary.eligibleRuns += 1;
    summary.eligibleFiles += group.files.length;
    if (reason === 'ttl') {
      summary.ttlEligibleRuns += 1;
      summary.ttlEligibleFiles += group.files.length;
    } else if (reason === 'max-runs') {
      summary.maxRunsEligibleRuns += 1;
      summary.maxRunsEligibleFiles += group.files.length;
    } else if (reason === 'max-files') {
      summary.maxFilesEligibleRuns += 1;
      summary.maxFilesEligibleFiles += group.files.length;
    }
  };

  for (const group of runGroups) {
    if (group.newestMtimeMs <= cutoffMs) {
      markRunForRemoval(group, 'ttl');
      continue;
    }
    runsToKeep.push(group);
  }

  const sortRunsByOldestFirst = (a, b) => {
    if (a.newestMtimeMs !== b.newestMtimeMs) {
      return a.newestMtimeMs - b.newestMtimeMs;
    }
    return a.runKey.localeCompare(b.runKey);
  };

  if (runsToKeep.length > maxRuns) {
    const overflowRunsCount = runsToKeep.length - maxRuns;
    const staleRuns = [...runsToKeep]
      .sort(sortRunsByOldestFirst)
      .slice(0, overflowRunsCount);
    const staleRunKeys = new Set(staleRuns.map((group) => group.runKey));
    const retainedRuns = [];
    for (const group of runsToKeep) {
      if (staleRunKeys.has(group.runKey)) {
        markRunForRemoval(group, 'max-runs');
        continue;
      }
      retainedRuns.push(group);
    }
    runsToKeep.length = 0;
    runsToKeep.push(...retainedRuns);
  }

  let keptFilesAfterRunCap = runsToKeep.reduce(
    (total, group) => total + group.files.length,
    0,
  );
  if (keptFilesAfterRunCap > maxFiles) {
    const staleRuns = [...runsToKeep].sort(sortRunsByOldestFirst);
    const staleRunKeys = new Set();
    for (const group of staleRuns) {
      if (keptFilesAfterRunCap <= maxFiles) {
        break;
      }
      staleRunKeys.add(group.runKey);
      keptFilesAfterRunCap -= group.files.length;
    }

    const retainedRuns = [];
    for (const group of runsToKeep) {
      if (staleRunKeys.has(group.runKey)) {
        markRunForRemoval(group, 'max-files');
        continue;
      }
      retainedRuns.push(group);
    }
    runsToKeep.length = 0;
    runsToKeep.push(...retainedRuns);
  }

  for (const runGroup of runsToRemove) {
    summary.removedRuns += 1;
    for (const file of runGroup.files) {
      summary.removedBytes += file.size;
      if (!dryRun) {
        await unlink(file.filePath);
      }
      summary.removedFiles += 1;
    }
  }

  summary.keptRuns = summary.matchedRuns - summary.removedRuns;
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
  return `[${label}] retry logs cleanup ${action} ${summary.removedRuns}/${summary.eligibleRuns} run groups (${summary.removedFiles} files; ttl: ${summary.ttlEligibleRuns} runs, max-runs: ${summary.maxRunsEligibleRuns} runs, max-files: ${summary.maxFilesEligibleRuns} runs); kept ${summary.keptRuns}/${summary.matchedRuns} runs (${summary.keptFiles}/${summary.matchedFiles} files) with limits max-runs=${summary.maxRuns}, max-files=${summary.maxFiles}; scanned ${summary.scannedFiles} files (${bytesLabel}).`;
};
