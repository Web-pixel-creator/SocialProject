import {
  RETRY_CLEANUP_JSON_SCHEMA_PATH,
  RETRY_CLEANUP_JSON_SCHEMA_VERSION,
  RETRY_COLLECT_JSON_SCHEMA_PATH,
  RETRY_COLLECT_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';

const MOCK_REPO_SLUG = 'Web-pixel-creator/SocialProject';
const MOCK_RUN_ID = 21794547923;
const MOCK_RUN_NUMBER = 155;
const MOCK_RUN_URL =
  'https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794547923';
const MOCK_METADATA_PATH =
  'artifacts/release/retry-failures/run-155-runid-21794547923-retry-metadata.json';

export const createRetryCleanupSummaryMock = (overrides = {}) => {
  return {
    outputDir: 'artifacts/release/retry-failures',
    enabled: true,
    dryRun: true,
    ttlDays: 14,
    maxRuns: 100,
    maxFiles: 200,
    cutoffIso: '2026-02-08T00:00:00.000Z',
    scannedFiles: 10,
    matchedFiles: 10,
    matchedRuns: 5,
    eligibleFiles: 2,
    eligibleRuns: 1,
    ttlEligibleFiles: 0,
    ttlEligibleRuns: 0,
    maxRunsEligibleFiles: 2,
    maxRunsEligibleRuns: 1,
    maxFilesEligibleFiles: 0,
    maxFilesEligibleRuns: 0,
    keptFiles: 8,
    keptRuns: 4,
    removedFiles: 2,
    removedRuns: 1,
    removedBytes: 18517,
    missingDirectory: false,
    skippedDisabled: false,
    ...overrides,
  };
};

export const createRetryCleanupOutputMock = ({
  summaryOverrides = {},
  outputOverrides = {},
} = {}) => {
  return {
    schemaPath: RETRY_CLEANUP_JSON_SCHEMA_PATH,
    schemaVersion: RETRY_CLEANUP_JSON_SCHEMA_VERSION,
    label: 'retry:cleanup',
    summary: createRetryCleanupSummaryMock(summaryOverrides),
    ...outputOverrides,
  };
};

export const createRetryCollectJobMock = (overrides = {}) => {
  return {
    id: 62879762025,
    name: 'Release Smoke Dry-Run (staging/manual)',
    htmlUrl:
      'https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794547923/job/62879762025',
    startedAt: '2026-02-08T07:44:06Z',
    completedAt: '2026-02-08T07:44:37Z',
    logFilePath:
      'artifacts/release/retry-failures/run-155-runid-21794547923-job-62879762025-Release_Smoke_Dry-Run_staging_manual_.log',
    logCaptured: true,
    ...overrides,
  };
};

export const createRetryCollectCollectionMock = ({
  jobs = [createRetryCollectJobMock()],
  metadataPath = MOCK_METADATA_PATH,
  overrides = {},
} = {}) => {
  const normalizedJobs = [...jobs];
  return {
    metadataPath,
    totalJobs: normalizedJobs.length,
    capturedJobs: normalizedJobs.filter((job) => job.logCaptured).length,
    failedJobs: normalizedJobs.filter((job) => !job.logCaptured).length,
    jobs: normalizedJobs,
    ...overrides,
  };
};

export const createRetryCollectOutputMock = ({
  includeNonFailed,
  selectedJobs,
  cleanupSummary,
  collection,
  message,
  outputOverrides = {},
} = {}) => {
  return {
    schemaPath: RETRY_COLLECT_JSON_SCHEMA_PATH,
    schemaVersion: RETRY_COLLECT_JSON_SCHEMA_VERSION,
    label: 'retry:collect',
    repoSlug: MOCK_REPO_SLUG,
    runId: MOCK_RUN_ID,
    runNumber: MOCK_RUN_NUMBER,
    runUrl: MOCK_RUN_URL,
    runConclusion: 'success',
    includeNonFailed:
      includeNonFailed ?? (selectedJobs ?? 1) > 0,
    selectedJobs: selectedJobs ?? (collection ? collection.totalJobs : 0),
    cleanupSummary: cleanupSummary ?? null,
    collection: collection ?? null,
    message:
      message ??
      'No matching Release Smoke Dry-Run jobs selected for log collection.',
    ...outputOverrides,
  };
};

export const createRetryCollectEmptyOutputMock = () => {
  return createRetryCollectOutputMock({
    includeNonFailed: false,
    selectedJobs: 0,
    cleanupSummary: null,
    collection: null,
    message: 'No matching Release Smoke Dry-Run jobs selected for log collection.',
  });
};

export const createRetryCollectSuccessOutputMock = () => {
  const cleanupSummary = createRetryCleanupSummaryMock({
    dryRun: false,
    scannedFiles: 12,
    matchedFiles: 12,
    matchedRuns: 6,
    eligibleFiles: 0,
    eligibleRuns: 0,
    maxRunsEligibleFiles: 0,
    maxRunsEligibleRuns: 0,
    keptFiles: 12,
    keptRuns: 6,
    removedFiles: 0,
    removedRuns: 0,
    removedBytes: 0,
  });
  const collection = createRetryCollectCollectionMock();

  return createRetryCollectOutputMock({
    includeNonFailed: true,
    selectedJobs: 1,
    cleanupSummary,
    collection,
    message: 'Retry diagnostics collection completed.',
  });
};
