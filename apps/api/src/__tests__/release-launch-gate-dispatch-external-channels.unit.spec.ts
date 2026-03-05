import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const externalChannelsModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'dispatch-production-launch-gate-external-channels.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runModuleAction = <T>({
  action,
  input,
}: {
  action: 'constants' | 'parse';
  input: unknown;
}) => {
  const script = `
    import {
      ALLOWED_EXTERNAL_CHANNELS,
      parseDispatchExternalChannels,
    } from ${JSON.stringify(externalChannelsModuleHref)};

    const action = ${JSON.stringify(action)};
    const input = ${JSON.stringify(input)};

    try {
      let result;
      if (action === 'constants') {
        result = { ALLOWED_EXTERNAL_CHANNELS };
      } else {
        result = parseDispatchExternalChannels(input.raw, input.sourceLabel);
      }
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<T>;
  return {
    output,
    payload,
  };
};

describe('launch-gate dispatch external-channels parser', () => {
  test('exports expected allowed external channels', () => {
    const result = runModuleAction<{ ALLOWED_EXTERNAL_CHANNELS: string[] }>({
      action: 'constants',
      input: {},
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result.ALLOWED_EXTERNAL_CHANNELS).toEqual([
      'telegram',
      'slack',
      'discord',
    ]);
  });

  test('normalizes case, trims values, and de-duplicates channels', () => {
    const result = runModuleAction<string>({
      action: 'parse',
      input: {
        raw: ' Slack,telegram,slack , Discord ',
        sourceLabel: '--required-external-channels',
      },
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe('slack,telegram,discord');
  });

  test('returns all keyword when provided in set', () => {
    const result = runModuleAction<string>({
      action: 'parse',
      input: {
        raw: 'telegram,all,slack',
        sourceLabel: '--required-external-channels',
      },
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe('all');
  });

  test('returns empty string for blank values', () => {
    const result = runModuleAction<string>({
      action: 'parse',
      input: {
        raw: ' ,  , ',
        sourceLabel: '--required-external-channels',
      },
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toBe('');
  });

  test('throws on unsupported channels', () => {
    const result = runModuleAction<string>({
      action: 'parse',
      input: {
        raw: 'telegram,teams',
        sourceLabel: '--required-external-channels',
      },
    });

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('contains unsupported channels');
    expect(result.payload.error).toContain('telegram, slack, discord');
  });
});
