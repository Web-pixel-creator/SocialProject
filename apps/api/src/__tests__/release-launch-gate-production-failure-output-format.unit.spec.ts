import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const moduleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'production-launch-gate-failure-output-format.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runBuildFailureLines = (input: unknown) => {
  const script = `
    import { buildProductionLaunchGateFailureLines } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const result = buildProductionLaunchGateFailureLines(input);
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string[]>;
  return {
    output,
    payload,
  };
};

describe('production launch-gate failure output formatter', () => {
  test('renders failed checks and truncates long arrays', () => {
    const result = runBuildFailureLines({
      checks: {
        ingestExternalChannelFailureModes: {
          failedChannels: [
            { channel: 'telegram', failureMode: 'ingest_http_error' },
            { channel: 'slack', failureMode: 'telemetry_zero_accepted' },
            { channel: 'discord', failureMode: 'fallback_session_mismatch' },
          ],
          pass: false,
          requiredFailedChannels: [
            { channel: 'telegram', failureMode: 'ingest_http_error' },
            { channel: 'slack', failureMode: 'telemetry_zero_accepted' },
            { channel: 'discord', failureMode: 'fallback_session_mismatch' },
          ],
          skipped: false,
        },
        runtimeProbe: { pass: true, skipped: false },
        smokeRequiredSteps: {
          failed: ['api.search', 'web.search', 'web.feed'],
          missing: [
            'api.health',
            'api.ready',
            'api.draft.create',
            'api.draft.get',
          ],
          pass: false,
          required: ['api.health', 'api.ready', 'api.draft.create'],
          skipped: false,
        },
      },
      error: { message: 'Ingest probe failed' },
      maxArrayItems: 2,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result[0]).toBe('Failed checks (2):');
    expect(result.payload.result).toContain(
      '- ingestExternalChannelFailureModes',
    );
    expect(result.payload.result).toContain('- smokeRequiredSteps');

    const joined = result.payload.result.join('\n');
    expect(joined).toContain('"failedChannels":[{"channel":"telegram"');
    expect(joined).toContain('"+1 more"');
    expect(joined).toContain('"missing":["api.health","api.ready","+2 more"]');
    expect(joined).toContain('Error: Ingest probe failed');
  });

  test('prints no-failed-checks line when all checks pass', () => {
    const result = runBuildFailureLines({
      checks: {
        runtimeProbe: { pass: true, skipped: false },
      },
      error: null,
      maxArrayItems: 3,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual(['No failed checks captured.']);
  });
});
