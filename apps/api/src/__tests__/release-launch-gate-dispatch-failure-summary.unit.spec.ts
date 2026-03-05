import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const moduleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'dispatch-production-launch-gate-failure-summary.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runBuildSummary = (jobs: unknown) => {
  const script = `
    import { buildDispatchRunFailureSummary } from ${JSON.stringify(moduleHref)};
    const jobs = ${JSON.stringify(jobs)};
    try {
      const result = buildDispatchRunFailureSummary(jobs);
      process.stdout.write(JSON.stringify({ ok: true, result, error: '' }));
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    }
  `;

  const output = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string>;
  return {
    output,
    payload,
  };
};

describe('launch-gate dispatch failure summary formatter', () => {
  test('returns empty string when there are no failed jobs', () => {
    const result = runBuildSummary([
      { conclusion: 'success', name: 'build' },
      { conclusion: 'success', name: 'test' },
    ]);

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe('');
  });

  test('renders failed job summary with first failed step when available', () => {
    const result = runBuildSummary([
      {
        conclusion: 'failure',
        html_url:
          'https://github.com/Web-pixel-creator/SocialProject/actions/runs/22717781874/job/123',
        name: 'production launch gate',
        steps: [
          { conclusion: 'success', name: 'Checkout' },
          { conclusion: 'failure', name: 'Run strict gate' },
        ],
      },
      {
        conclusion: 'cancelled',
        name: 'post-health-report',
        steps: [],
      },
    ]);

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe(
      'Failed jobs: production launch gate [failure] step: Run strict gate logs: https://github.com/Web-pixel-creator/SocialProject/actions/runs/22717781874/job/123; post-health-report [cancelled]',
    );
  });

  test('handles missing job names and missing step arrays', () => {
    const result = runBuildSummary([
      {
        conclusion: 'timed_out',
      },
    ]);

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe('Failed jobs: unnamed-job [timed_out]');
  });

  test('skips empty failed-job log urls and renders per-job log hints', () => {
    const result = runBuildSummary([
      {
        conclusion: 'failure',
        html_url: '   ',
        name: 'compile',
      },
      {
        conclusion: 'cancelled',
        html_url:
          'https://github.com/Web-pixel-creator/SocialProject/actions/runs/22717781874/job/456',
        name: 'publish',
      },
    ]);

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe(
      'Failed jobs: compile [failure]; publish [cancelled] logs: https://github.com/Web-pixel-creator/SocialProject/actions/runs/22717781874/job/456',
    );
  });

  test('caps failed-job details and appends remaining count hint', () => {
    const result = runBuildSummary([
      { conclusion: 'failure', name: 'job-1' },
      { conclusion: 'failure', name: 'job-2' },
      { conclusion: 'failure', name: 'job-3' },
      { conclusion: 'failure', name: 'job-4' },
      { conclusion: 'failure', name: 'job-5' },
      { conclusion: 'failure', name: 'job-6' },
      { conclusion: 'failure', name: 'job-7' },
    ]);

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe(
      'Failed jobs: job-1 [failure]; job-2 [failure]; job-3 [failure]; job-4 [failure]; job-5 [failure]; +2 more failed jobs',
    );
  });
});
