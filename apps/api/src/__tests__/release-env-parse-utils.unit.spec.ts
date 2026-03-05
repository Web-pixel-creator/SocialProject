import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const moduleHref = pathToFileURL(
  path.join(projectRoot, 'scripts', 'release', 'release-env-parse-utils.mjs'),
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
  action: 'parseBoolean' | 'parsePositiveInteger';
  input: unknown;
}) => {
  const script = `
    import {
      parseReleaseBooleanEnv,
      parseReleasePositiveIntegerEnv,
    } from ${JSON.stringify(moduleHref)};

    const action = ${JSON.stringify(action)};
    const input = ${JSON.stringify(input)};

    try {
      let result;
      if (action === 'parseBoolean') {
        result = parseReleaseBooleanEnv(input.raw, input.fallback, input.sourceLabel);
      } else {
        result = parseReleasePositiveIntegerEnv(input.raw, input.fallback, input.sourceLabel);
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

describe('release env parse utils', () => {
  test('boolean parser supports fallback and accepted values', () => {
    const fallbackResult = runModuleAction<boolean>({
      action: 'parseBoolean',
      input: {
        fallback: true,
        raw: '',
        sourceLabel: 'RELEASE_SAMPLE_BOOL',
      },
    });
    const trueResult = runModuleAction<boolean>({
      action: 'parseBoolean',
      input: {
        fallback: false,
        raw: 'YeS',
        sourceLabel: 'RELEASE_SAMPLE_BOOL',
      },
    });
    const falseResult = runModuleAction<boolean>({
      action: 'parseBoolean',
      input: {
        fallback: true,
        raw: '0',
        sourceLabel: 'RELEASE_SAMPLE_BOOL',
      },
    });

    expect(fallbackResult.output.status).toBe(0);
    expect(fallbackResult.payload.result).toBe(true);
    expect(trueResult.output.status).toBe(0);
    expect(trueResult.payload.result).toBe(true);
    expect(falseResult.output.status).toBe(0);
    expect(falseResult.payload.result).toBe(false);
  });

  test('boolean parser throws on unsupported values', () => {
    const result = runModuleAction<boolean>({
      action: 'parseBoolean',
      input: {
        fallback: false,
        raw: 'maybe',
        sourceLabel: 'RELEASE_SAMPLE_BOOL',
      },
    });

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain(
      'Invalid value for RELEASE_SAMPLE_BOOL: maybe',
    );
  });

  test('positive integer parser supports fallback and valid integers', () => {
    const fallbackResult = runModuleAction<number>({
      action: 'parsePositiveInteger',
      input: {
        fallback: 5000,
        raw: '',
        sourceLabel: 'RELEASE_SAMPLE_MS',
      },
    });
    const valueResult = runModuleAction<number>({
      action: 'parsePositiveInteger',
      input: {
        fallback: 5000,
        raw: '12000',
        sourceLabel: 'RELEASE_SAMPLE_MS',
      },
    });
    const leadingZeroResult = runModuleAction<number>({
      action: 'parsePositiveInteger',
      input: {
        fallback: 5000,
        raw: '00015',
        sourceLabel: 'RELEASE_SAMPLE_MS',
      },
    });

    expect(fallbackResult.output.status).toBe(0);
    expect(fallbackResult.payload.result).toBe(5000);
    expect(valueResult.output.status).toBe(0);
    expect(valueResult.payload.result).toBe(12_000);
    expect(leadingZeroResult.output.status).toBe(0);
    expect(leadingZeroResult.payload.result).toBe(15);
  });

  test('positive integer parser throws on unsupported values', () => {
    const invalidCases = ['0', 'abc', '12abc', '3.5'];
    for (const value of invalidCases) {
      const result = runModuleAction<number>({
        action: 'parsePositiveInteger',
        input: {
          fallback: 5000,
          raw: value,
          sourceLabel: 'RELEASE_SAMPLE_MS',
        },
      });

      expect(result.output.status).toBe(1);
      expect(result.payload.ok).toBe(false);
      expect(result.payload.error).toContain(
        `Invalid value for RELEASE_SAMPLE_MS: ${value}`,
      );
    }
  });
});
