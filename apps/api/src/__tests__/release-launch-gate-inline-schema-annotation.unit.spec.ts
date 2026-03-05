import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const runId = 999_999_024;
const summaryRelativePath = `artifacts/release/production-launch-gate-summary-${String(runId)}.json`;
const schemaPassRelativePath = `artifacts/release/post-release-health-inline-artifacts-schema-check-${String(runId)}-pass.json`;
const schemaFailRelativePath = `artifacts/release/post-release-health-inline-artifacts-schema-check-${String(runId)}-fail.json`;

const createBaseSummary = () => ({
  status: 'pass',
  pass: true,
  checks: {
    smoke: {
      pass: true,
      skipped: false,
    },
    launchHealth: {
      pass: true,
      skipped: false,
    },
  },
});

const createSchemaCheckPayload = (status: 'pass' | 'fail') => ({
  label: 'release:health:inline-artifacts:schema:check',
  mode: 'inline-health-artifacts-summary',
  status,
  totals: {
    fixturePayloads: 1,
    runtimePayloads: status === 'pass' ? 1 : 0,
    validatedPayloads: status === 'pass' ? 2 : 1,
  },
  runtimeSummaryPath:
    'artifacts/release/post-release-health-inline-artifacts-summary-22712765220.json',
  failures:
    status === 'pass'
      ? []
      : [
          'runtime summary (artifacts/release/post-release-health-inline-artifacts-summary-22712765220.json) is invalid: /status: must be equal to one of the allowed values',
        ],
});

const writeFixture = async (relativePath: string, payload: unknown) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
};

const removeFixture = async (relativePath: string) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await rm(absolutePath, { force: true });
};

const runAnnotation = (schemaCheckPath: string) =>
  spawnSync(
    process.execPath,
    [
      'scripts/release/annotate-launch-gate-summary-inline-schema-check.mjs',
      '--summary',
      summaryRelativePath,
      '--schema-check',
      schemaCheckPath,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

const readSummaryFixture = async () => {
  const summaryPath = path.join(projectRoot, summaryRelativePath);
  const text = await readFile(summaryPath, 'utf8');
  return JSON.parse(text);
};

describe('launch-gate summary inline schema annotation script', () => {
  afterAll(async () => {
    await removeFixture(summaryRelativePath);
    await removeFixture(schemaPassRelativePath);
    await removeFixture(schemaFailRelativePath);
  });

  test('adds passing inline schema check and keeps summary pass status', async () => {
    await writeFixture(summaryRelativePath, createBaseSummary());
    await writeFixture(
      schemaPassRelativePath,
      createSchemaCheckPayload('pass'),
    );

    const result = runAnnotation(schemaPassRelativePath);

    expect(result.status).toBe(0);
    const summary = await readSummaryFixture();
    expect(summary.status).toBe('pass');
    expect(summary.pass).toBe(true);
    expect(summary.checks.inlineHealthArtifactsSchema).toMatchObject({
      pass: true,
      skipped: false,
      status: 'pass',
    });
  });

  test('adds failing inline schema check and flips summary to fail', async () => {
    await writeFixture(summaryRelativePath, createBaseSummary());
    await writeFixture(
      schemaFailRelativePath,
      createSchemaCheckPayload('fail'),
    );

    const result = runAnnotation(schemaFailRelativePath);

    expect(result.status).toBe(0);
    const summary = await readSummaryFixture();
    expect(summary.status).toBe('fail');
    expect(summary.pass).toBe(false);
    expect(summary.checks.inlineHealthArtifactsSchema).toMatchObject({
      pass: false,
      skipped: false,
      status: 'fail',
    });
    expect(summary.checks.inlineHealthArtifactsSchema.failures).toHaveLength(1);
  });
});
