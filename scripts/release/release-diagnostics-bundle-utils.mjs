import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_PATH,
  RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_VERSION,
  RELEASE_DIAGNOSTICS_BUNDLE_LABEL,
} from './release-diagnostics-schema-contracts.mjs';

export const DEFAULT_RELEASE_DIAGNOSTICS_DIR = 'artifacts/release/diagnostics';

const DEFAULT_CLEANUP_ENABLED = true;
const DEFAULT_CLEANUP_DRY_RUN = false;
const DEFAULT_TTL_DAYS = 14;
const DEFAULT_MAX_BUNDLES = 50;
const DEFAULT_MAX_FILES = 400;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BUNDLE_DIR_PREFIX = 'bundle-';
const MANIFEST_FILE_NAME = 'release-diagnostics-bundle.json';

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

const parseInteger = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const sanitizePathSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+/u, '')
    .replace(/-+$/u, '')
    .replace(/-{2,}/gu, '-');
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, 80);
};

const toRelativePath = (workspaceRoot, filePath) =>
  path.relative(workspaceRoot, filePath).replace(/\\/gu, '/');

const loadJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const writeJson = async (filePath, payload) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const statFileIfPresent = async (filePath) => {
  try {
    const entry = await stat(filePath);
    if (!entry.isFile()) {
      return null;
    }
    return entry;
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const collectDirectoryStats = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  let totalBytes = 0;
  let totalFiles = 0;
  let newestMtimeMs = 0;

  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const childStats = await collectDirectoryStats(childPath);
      totalBytes += childStats.totalBytes;
      totalFiles += childStats.totalFiles;
      newestMtimeMs = Math.max(newestMtimeMs, childStats.newestMtimeMs);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const childStat = await stat(childPath);
    totalBytes += childStat.size;
    totalFiles += 1;
    newestMtimeMs = Math.max(newestMtimeMs, childStat.mtimeMs);
  }

  return {
    newestMtimeMs,
    totalBytes,
    totalFiles,
  };
};

export const resolveReleaseDiagnosticsBundlesDir = (env = process.env) => {
  const configured = env.RELEASE_DIAGNOSTICS_BUNDLES_DIR;
  if (typeof configured !== 'string') {
    return DEFAULT_RELEASE_DIAGNOSTICS_DIR;
  }
  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_RELEASE_DIAGNOSTICS_DIR;
};

export const resolveReleaseDiagnosticsCleanupConfig = (env = process.env) => ({
  dryRun: parseBoolean(
    env.RELEASE_DIAGNOSTICS_BUNDLES_CLEANUP_DRY_RUN,
    DEFAULT_CLEANUP_DRY_RUN,
  ),
  enabled: parseBoolean(
    env.RELEASE_DIAGNOSTICS_BUNDLES_CLEANUP_ENABLED,
    DEFAULT_CLEANUP_ENABLED,
  ),
  maxBundles: parseInteger(
    env.RELEASE_DIAGNOSTICS_BUNDLES_MAX_RUNS,
    DEFAULT_MAX_BUNDLES,
  ),
  maxFiles: parseInteger(
    env.RELEASE_DIAGNOSTICS_BUNDLES_MAX_FILES,
    DEFAULT_MAX_FILES,
  ),
  ttlDays: parseInteger(
    env.RELEASE_DIAGNOSTICS_BUNDLES_TTL_DAYS,
    DEFAULT_TTL_DAYS,
  ),
});

export const cleanupReleaseDiagnosticsBundles = async ({
  dryRun,
  enabled,
  maxBundles,
  maxFiles,
  nowMs = Date.now(),
  outputDir,
  protectedBundleDir = '',
  ttlDays,
}) => {
  const cutoffMs = nowMs - ttlDays * DAY_IN_MS;
  const summary = {
    cutoffIso: new Date(cutoffMs).toISOString(),
    dryRun,
    eligibleBundles: 0,
    eligibleFiles: 0,
    enabled,
    keptBundles: 0,
    keptFiles: 0,
    matchedBundles: 0,
    matchedFiles: 0,
    maxBundles,
    maxBundlesEligibleBundles: 0,
    maxBundlesEligibleFiles: 0,
    maxFiles,
    maxFilesEligibleBundles: 0,
    maxFilesEligibleFiles: 0,
    missingDirectory: false,
    outputDir,
    removedBundles: 0,
    removedBytes: 0,
    removedFiles: 0,
    scannedBundles: 0,
    skippedDisabled: false,
    ttlDays,
    ttlEligibleBundles: 0,
    ttlEligibleFiles: 0,
  };

  if (!enabled) {
    summary.skippedDisabled = true;
    return summary;
  }

  let entries = [];
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

  const protectedPath =
    typeof protectedBundleDir === 'string' && protectedBundleDir.length > 0
      ? path.resolve(protectedBundleDir)
      : '';
  const bundles = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(BUNDLE_DIR_PREFIX)) {
      continue;
    }
    const bundlePath = path.join(outputDir, entry.name);
    const stats = await collectDirectoryStats(bundlePath);
    bundles.push({
      bundlePath,
      protected: protectedPath === path.resolve(bundlePath),
      ...stats,
    });
  }

  summary.scannedBundles = bundles.length;
  summary.matchedBundles = bundles.length;
  summary.matchedFiles = bundles.reduce(
    (total, bundle) => total + bundle.totalFiles,
    0,
  );

  const bundlesToKeep = [];
  const bundlesToRemove = [];
  const markForRemoval = (bundle, reason) => {
    bundlesToRemove.push({
      ...bundle,
      reason,
    });
    summary.eligibleBundles += 1;
    summary.eligibleFiles += bundle.totalFiles;
    if (reason === 'ttl') {
      summary.ttlEligibleBundles += 1;
      summary.ttlEligibleFiles += bundle.totalFiles;
    } else if (reason === 'max-bundles') {
      summary.maxBundlesEligibleBundles += 1;
      summary.maxBundlesEligibleFiles += bundle.totalFiles;
    } else if (reason === 'max-files') {
      summary.maxFilesEligibleBundles += 1;
      summary.maxFilesEligibleFiles += bundle.totalFiles;
    }
  };

  for (const bundle of bundles) {
    if (!bundle.protected && bundle.newestMtimeMs <= cutoffMs) {
      markForRemoval(bundle, 'ttl');
      continue;
    }
    bundlesToKeep.push(bundle);
  }

  const sortByOldestFirst = (left, right) => {
    if (left.newestMtimeMs !== right.newestMtimeMs) {
      return left.newestMtimeMs - right.newestMtimeMs;
    }
    return left.bundlePath.localeCompare(right.bundlePath);
  };

  const removeOverflowBundles = (reason, shouldRemove) => {
    const sortedBundles = [...bundlesToKeep]
      .filter((bundle) => !bundle.protected)
      .sort(sortByOldestFirst);
    const staleBundlePaths = new Set();
    let projectedBundleCount = bundlesToKeep.length;
    let projectedFileCount = bundlesToKeep.reduce(
      (total, bundle) => total + bundle.totalFiles,
      0,
    );
    for (const bundle of sortedBundles) {
      if (
        !shouldRemove({
          bundleCount: projectedBundleCount,
          fileCount: projectedFileCount,
        })
      ) {
        break;
      }
      staleBundlePaths.add(bundle.bundlePath);
      projectedBundleCount -= 1;
      projectedFileCount -= bundle.totalFiles;
    }
    if (staleBundlePaths.size === 0) {
      return;
    }
    const retained = [];
    for (const bundle of bundlesToKeep) {
      if (staleBundlePaths.has(bundle.bundlePath)) {
        markForRemoval(bundle, reason);
        continue;
      }
      retained.push(bundle);
    }
    bundlesToKeep.length = 0;
    bundlesToKeep.push(...retained);
  };

  removeOverflowBundles(
    'max-bundles',
    ({ bundleCount }) => bundleCount > maxBundles,
  );
  removeOverflowBundles(
    'max-files',
    ({ fileCount }) => fileCount > maxFiles,
  );

  for (const bundle of bundlesToRemove) {
    summary.removedBundles += 1;
    summary.removedFiles += bundle.totalFiles;
    summary.removedBytes += bundle.totalBytes;
    if (!dryRun) {
      await rm(bundle.bundlePath, { force: true, recursive: true });
    }
  }

  summary.keptBundles = summary.matchedBundles - summary.removedBundles;
  summary.keptFiles = summary.matchedFiles - summary.removedFiles;
  return summary;
};

export const captureReleaseDiagnosticsBundle = async ({
  artifactFiles,
  cleanupConfig,
  clock = () => new Date(),
  correlation = null,
  outputDir,
  source,
  summary = null,
  triggers,
  workspaceRoot = process.cwd(),
}) => {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('source is required for diagnostics bundle capture.');
  }
  const normalizedTriggers = Array.isArray(triggers) ? triggers : [];
  if (normalizedTriggers.length === 0) {
    throw new Error('at least one diagnostics trigger is required.');
  }

  const generatedAtUtc = clock().toISOString();
  const outputRoot = path.resolve(outputDir);
  const bundleId = [
    BUNDLE_DIR_PREFIX,
    generatedAtUtc.replace(/[-:]/gu, '').replace(/\.\d{3}z$/iu, 'z'),
    sanitizePathSegment(source, 'source'),
    sanitizePathSegment(normalizedTriggers[0]?.code || 'trigger', 'trigger'),
  ].join('');
  const bundleDir = path.join(outputRoot, bundleId);
  const bundleArtifactsDir = path.join(bundleDir, 'artifacts');

  await mkdir(bundleArtifactsDir, { recursive: true });

  const normalizedArtifacts = Array.isArray(artifactFiles) ? artifactFiles : [];
  const artifacts = [];
  for (const [index, artifact] of normalizedArtifacts.entries()) {
    const label =
      artifact &&
      typeof artifact === 'object' &&
      typeof artifact.label === 'string' &&
      artifact.label.trim().length > 0
        ? artifact.label.trim()
        : `artifact-${index + 1}`;
    const sourcePathRaw =
      artifact && typeof artifact === 'object' && typeof artifact.path === 'string'
        ? artifact.path
        : '';
    if (!sourcePathRaw) {
      artifacts.push({
        bundlePath: null,
        copied: false,
        label,
        present: false,
        reason: 'missing path',
        sizeBytes: null,
        sourcePath: null,
      });
      continue;
    }
    const sourcePath = path.resolve(sourcePathRaw);
    const sourceStats = await statFileIfPresent(sourcePath);
    if (!sourceStats) {
      artifacts.push({
        bundlePath: null,
        copied: false,
        label,
        present: false,
        reason: 'source file missing',
        sizeBytes: null,
        sourcePath: toRelativePath(workspaceRoot, sourcePath),
      });
      continue;
    }
    const sourceExtension = path.extname(sourcePath) || '.json';
    const fileName = `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(
      label,
      'artifact',
    )}${sourceExtension}`;
    const bundlePath = path.join(bundleArtifactsDir, fileName);
    await copyFile(sourcePath, bundlePath);
    artifacts.push({
      bundlePath: toRelativePath(workspaceRoot, bundlePath),
      copied: true,
      label,
      present: true,
      reason: null,
      sizeBytes: sourceStats.size,
      sourcePath: toRelativePath(workspaceRoot, sourcePath),
    });
  }

  const failedChecks = Object.entries(summary?.checks ?? {})
    .filter(([, value]) => value && typeof value === 'object' && value.pass === false)
    .map(([name]) => name)
    .sort();

  let manifest = {
    artifacts,
    bundleId,
    bundlePath: toRelativePath(workspaceRoot, bundleDir),
    cleanupSummary: null,
    correlation,
    generatedAtUtc,
    label: RELEASE_DIAGNOSTICS_BUNDLE_LABEL,
    schemaPath: RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_PATH,
    schemaVersion: RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_VERSION,
    source: source.trim(),
    summary: {
      failedChecks,
      pass: summary?.pass ?? null,
      smokeRetriesUsed:
        typeof summary?.diagnosticsMeta?.smokeRetriesUsed === 'number'
          ? summary.diagnosticsMeta.smokeRetriesUsed
          : 0,
      status: typeof summary?.status === 'string' ? summary.status : 'unknown',
    },
    triggers: normalizedTriggers.map((trigger) => ({
      code:
        trigger && typeof trigger === 'object' && typeof trigger.code === 'string'
          ? trigger.code
          : 'unknown_trigger',
      message:
        trigger &&
        typeof trigger === 'object' &&
        typeof trigger.message === 'string'
          ? trigger.message
          : '',
      severity:
        trigger &&
        typeof trigger === 'object' &&
        typeof trigger.severity === 'string'
          ? trigger.severity
          : 'medium',
    })),
  };

  const manifestPath = path.join(bundleDir, MANIFEST_FILE_NAME);
  await writeJson(manifestPath, manifest);

  const cleanupSummary = await cleanupReleaseDiagnosticsBundles({
    ...(cleanupConfig || resolveReleaseDiagnosticsCleanupConfig()),
    nowMs: Date.parse(generatedAtUtc),
    outputDir: outputRoot,
    protectedBundleDir: bundleDir,
  });
  manifest = {
    ...manifest,
    cleanupSummary,
  };
  await writeJson(manifestPath, manifest);

  return {
    ...manifest,
    manifestPath: toRelativePath(workspaceRoot, manifestPath),
  };
};

export const readReleaseDiagnosticsBundleManifest = async (manifestPath) =>
  loadJson(manifestPath);
