import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const moduleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'production-launch-gate-config-resolvers.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runResolveBoolean = ({
  candidates,
  fallback,
}: {
  candidates: Array<{ raw: unknown; source: unknown }>;
  fallback?: boolean;
}) => {
  const script = `
    import { resolveProductionBooleanConfig } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify({ candidates, fallback })};
    try {
      const result = resolveProductionBooleanConfig(input);
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<{
    source: string;
    value: boolean;
  }>;
  return {
    output,
    payload,
  };
};

const runResolveString = ({
  candidates,
  fallback,
}: {
  candidates: Array<{ raw: unknown; source: unknown }>;
  fallback?: string;
}) => {
  const script = `
    import { resolveProductionStringConfig } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify({ candidates, fallback })};
    try {
      const result = resolveProductionStringConfig(input);
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<{
    source: string;
    value: string;
  }>;
  return {
    output,
    payload,
  };
};

describe('production launch-gate boolean config resolver', () => {
  test('uses first non-empty candidate and parses truthy value', () => {
    const result = runResolveBoolean({
      candidates: [
        { raw: ' yes ', source: 'RELEASE_SANDBOX_EXECUTION_ENABLED' },
        { raw: 'false', source: 'SANDBOX_EXECUTION_ENABLED' },
      ],
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual({
      source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
      value: true,
    });
  });

  test('skips blank candidates and uses next available value', () => {
    const result = runResolveBoolean({
      candidates: [
        { raw: '   ', source: 'RELEASE_SANDBOX_EXECUTION_ENABLED' },
        { raw: '0', source: 'SANDBOX_EXECUTION_ENABLED' },
      ],
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual({
      source: 'SANDBOX_EXECUTION_ENABLED',
      value: false,
    });
  });

  test('returns unset fallback when no candidates have values', () => {
    const result = runResolveBoolean({
      candidates: [
        { raw: '', source: 'RELEASE_SANDBOX_EXECUTION_ENABLED' },
        { raw: null, source: 'SANDBOX_EXECUTION_ENABLED' },
      ],
      fallback: false,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual({
      source: 'unset',
      value: false,
    });
  });

  test('throws on invalid candidate boolean value', () => {
    const result = runResolveBoolean({
      candidates: [
        { raw: 'maybe', source: 'RELEASE_SANDBOX_EXECUTION_ENABLED' },
      ],
    });

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain(
      'Invalid value for RELEASE_SANDBOX_EXECUTION_ENABLED: maybe',
    );
  });
});

describe('production launch-gate string config resolver', () => {
  test('uses first non-empty candidate and trims value', () => {
    const result = runResolveString({
      candidates: [
        { raw: ' {"mode":"strict"} ', source: 'RELEASE_SANDBOX_EGRESS_JSON' },
        { raw: '{"mode":"fallback"}', source: 'SANDBOX_EGRESS_JSON' },
      ],
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual({
      source: 'RELEASE_SANDBOX_EGRESS_JSON',
      value: '{"mode":"strict"}',
    });
  });

  test('returns unset fallback when no candidate is present', () => {
    const result = runResolveString({
      candidates: [
        { raw: '', source: 'RELEASE_SANDBOX_EGRESS_JSON' },
        { raw: '   ', source: 'SANDBOX_EGRESS_JSON' },
      ],
      fallback: '',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual({
      source: 'unset',
      value: '',
    });
  });
});
