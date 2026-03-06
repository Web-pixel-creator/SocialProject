import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const runId = 999_999_023;
const validSummaryRelativePath = `artifacts/release/post-release-health-inline-artifacts-summary-${String(runId)}.json`;
const invalidSummaryRelativePath = `artifacts/release/post-release-health-inline-artifacts-summary-${String(runId + 1)}.json`;
const utf16SummaryRelativePath = `artifacts/release/post-release-health-inline-artifacts-summary-${String(runId + 2)}.json`;

const createValidSummaryPayload = (targetRunId: number) => ({
  schemaPath:
    'docs/ops/schemas/release-inline-health-artifacts-summary-output.schema.json',
  schemaVersion: '1.0.0',
  label: 'release:health:inline-artifacts:check',
  status: 'pass',
  strict: true,
  runId: targetRunId,
  requiredTotal: 3,
  presentTotal: 3,
  present: [
    `artifacts/release/post-release-health-run-${String(targetRunId)}.json`,
    `artifacts/release/post-release-health-summary-${String(targetRunId)}.json`,
    `artifacts/release/post-release-health-schema-summary-${String(targetRunId)}.json`,
  ],
  missing: [],
  checks: [
    {
      path: `artifacts/release/post-release-health-run-${String(targetRunId)}.json`,
      present: true,
      sizeBytes: 100,
      reason: null,
    },
    {
      path: `artifacts/release/post-release-health-summary-${String(targetRunId)}.json`,
      present: true,
      sizeBytes: 200,
      reason: null,
    },
    {
      path: `artifacts/release/post-release-health-schema-summary-${String(targetRunId)}.json`,
      present: true,
      sizeBytes: 300,
      reason: null,
    },
  ],
  generatedAtUtc: '2026-03-05T10:35:00.000Z',
});

const writeSummaryFixture = async ({
  encoding = 'utf8',
  relativePath,
  payload,
}: {
  encoding?: BufferEncoding;
  relativePath: string;
  payload: unknown;
}) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${encoding === 'utf16le' ? '\uFEFF' : ''}${JSON.stringify(payload, null, 2)}\n`,
    encoding,
  );
};

const removeSummaryFixture = async (relativePath: string) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await rm(absolutePath, { force: true });
};

describe('inline post-release health artifacts summary schema validator', () => {
  beforeAll(async () => {
    const validPayload = createValidSummaryPayload(runId);
    const invalidPayload = {
      ...createValidSummaryPayload(runId + 1),
      schemaVersion: '9.9.9',
    };
    await writeSummaryFixture({
      relativePath: validSummaryRelativePath,
      payload: validPayload,
    });
    await writeSummaryFixture({
      relativePath: invalidSummaryRelativePath,
      payload: invalidPayload,
    });
    await writeSummaryFixture({
      encoding: 'utf16le',
      relativePath: utf16SummaryRelativePath,
      payload: createValidSummaryPayload(runId + 2),
    });
  });

  afterAll(async () => {
    await removeSummaryFixture(validSummaryRelativePath);
    await removeSummaryFixture(invalidSummaryRelativePath);
    await removeSummaryFixture(utf16SummaryRelativePath);
  });

  test('passes with valid runtime summary payload', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts-summary-schema.mjs',
        validSummaryRelativePath,
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

  test('fails when runtime summary violates schema contract', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts-summary-schema.mjs',
        invalidSummaryRelativePath,
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
    expect(payload.failures[0]).toContain('runtime summary');
    expect(payload.failures[0]).toContain('/schemaVersion');
  });

  test('passes with valid UTF-16 LE runtime summary payload', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts-summary-schema.mjs',
        utf16SummaryRelativePath,
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
});
