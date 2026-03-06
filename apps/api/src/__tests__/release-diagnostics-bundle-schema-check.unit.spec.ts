import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const validBundleRelativePath =
  'artifacts/release/diagnostics/bundle-schema-test-valid/release-diagnostics-bundle.json';
const invalidBundleRelativePath =
  'artifacts/release/diagnostics/bundle-schema-test-invalid/release-diagnostics-bundle.json';

const createValidBundlePayload = () => ({
  schemaPath: 'docs/ops/schemas/release-diagnostics-bundle-output.schema.json',
  schemaVersion: '1.0.0',
  label: 'release:diagnostics:bundle',
  bundleId: 'bundle-20260306t050000zproduction-launch-gatelaunch_gate_failed',
  bundlePath: 'artifacts/release/diagnostics/bundle-schema-test-valid',
  generatedAtUtc: '2026-03-06T05:00:00.000Z',
  source: 'production-launch-gate',
  correlation: {
    releaseRunId: 'rel.production-launch-gate.20260306050000.abcdef1234',
    correlationId: 'rel.production-launch-gate.20260306050000.abcdef1234.corr',
    auditSessionId:
      'rel.production-launch-gate.20260306050000.abcdef1234.audit',
  },
  summary: {
    status: 'fail',
    pass: false,
    failedChecks: ['smoke'],
    smokeRetriesUsed: 1,
  },
  triggers: [
    {
      code: 'launch_gate_failed',
      message: 'Production launch gate ended in fail state.',
      severity: 'high',
    },
  ],
  artifacts: [
    {
      label: 'summary',
      sourcePath: 'artifacts/release/production-launch-gate-summary.json',
      bundlePath:
        'artifacts/release/diagnostics/bundle-schema-test-valid/artifacts/01-summary.json',
      present: true,
      copied: true,
      reason: null,
      sizeBytes: 512,
    },
  ],
  cleanupSummary: {
    outputDir: 'C:/SocialProject/artifacts/release/diagnostics',
    enabled: true,
    dryRun: false,
    ttlDays: 14,
    maxBundles: 50,
    maxFiles: 400,
    cutoffIso: '2026-02-20T05:00:00.000Z',
    scannedBundles: 1,
    matchedBundles: 1,
    matchedFiles: 2,
    eligibleBundles: 0,
    eligibleFiles: 0,
    ttlEligibleBundles: 0,
    ttlEligibleFiles: 0,
    maxBundlesEligibleBundles: 0,
    maxBundlesEligibleFiles: 0,
    maxFilesEligibleBundles: 0,
    maxFilesEligibleFiles: 0,
    keptBundles: 1,
    keptFiles: 2,
    removedBundles: 0,
    removedFiles: 0,
    removedBytes: 0,
    missingDirectory: false,
    skippedDisabled: false,
  },
});

const writeBundleFixture = async ({
  payload,
  relativePath,
}: {
  payload: unknown;
  relativePath: string;
}) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
};

const removeBundleFixture = async (relativePath: string) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await rm(path.dirname(absolutePath), { force: true, recursive: true });
};

describe('release diagnostics bundle schema validator', () => {
  beforeAll(async () => {
    await writeBundleFixture({
      payload: createValidBundlePayload(),
      relativePath: validBundleRelativePath,
    });
    await writeBundleFixture({
      payload: {
        ...createValidBundlePayload(),
        schemaVersion: '9.9.9',
      },
      relativePath: invalidBundleRelativePath,
    });
  });

  afterAll(async () => {
    await removeBundleFixture(validBundleRelativePath);
    await removeBundleFixture(invalidBundleRelativePath);
  });

  test('passes with a valid runtime diagnostics bundle payload', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-release-diagnostics-bundle-schema.mjs',
        validBundleRelativePath,
        '--json',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('pass');
    expect(payload.totals.fixturePayloads).toBe(1);
    expect(payload.totals.runtimePayloads).toBe(1);
    expect(payload.failures).toEqual([]);
  });

  test('fails when the runtime diagnostics bundle violates the schema', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-release-diagnostics-bundle-schema.mjs',
        invalidBundleRelativePath,
        '--json',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('fail');
    expect(payload.totals.fixturePayloads).toBe(1);
    expect(payload.totals.runtimePayloads).toBe(0);
    expect(payload.failures[0]).toContain('runtime bundle');
    expect(payload.failures[0]).toContain('/schemaVersion');
  });
});
