import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const runId = 999_999_013;
const reportPath = path.join(
  projectRoot,
  'artifacts',
  'release',
  `post-release-health-run-${String(runId)}.json`,
);

const fixtureReport = {
  generatedAtUtc: '2026-03-05T09:40:00.000Z',
  run: {
    id: runId,
    runNumber: 913,
    htmlUrl:
      'https://github.com/Web-pixel-creator/SocialProject/actions/runs/999999013',
  },
  summary: {
    pass: true,
    requiredJobsPassed: 1,
    requiredJobsTotal: 1,
    requiredArtifactsPresent: 10,
    requiredArtifactsTotal: 10,
    failedJobsTotal: 0,
    reasons: [],
  },
  smokeReport: {
    summary: {
      pass: true,
      totalSteps: 19,
      failedSteps: 0,
    },
  },
  externalChannelFailureModes: {
    pass: true,
    source: 'artifact',
    analyzedRuns: [{ runId: runId - 1 }, { runId }],
  },
  releaseHealthAlertTelemetry: {
    status: 'healthy',
    riskLevel: 'healthy',
    source: 'api',
    evaluated: true,
    escalationTriggered: false,
  },
  launchGateSandboxChecks: {
    pass: true,
    source: 'local',
    available: true,
  },
};

describe('append post-release health log script', () => {
  beforeAll(async () => {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify(fixtureReport, null, 2)}\n`,
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(reportPath, { force: true });
  });

  test('renders provenance fields in dry-run output', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/append-post-release-health-log.mjs',
        String(runId),
        '--dry-run',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      '- External-channel trend: pass=true source=artifact analyzedRuns=2.',
    );
    expect(result.stdout).toContain(
      '- Release-health alert telemetry: status=healthy risk=healthy source=api evaluated=true escalation=false.',
    );
    expect(result.stdout).toContain(
      '- Launch-gate sandbox checks: pass=true source=local available=true.',
    );
  });
});
