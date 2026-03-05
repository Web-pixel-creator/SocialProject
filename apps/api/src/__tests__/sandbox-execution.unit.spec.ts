import { ServiceError } from '../services/common/errors';
import { SandboxExecutionServiceImpl } from '../services/sandboxExecution/sandboxExecutionService';

describe('sandbox execution service phase-a fallback', () => {
  const createQueryable = () => ({
    query: jest.fn(async () => ({ rows: [] })),
  });
  const getLastTelemetryMetadata = (queryable: { query: jest.Mock }) => {
    const [, values] = queryable.query.mock.calls.at(-1) as [string, unknown[]];
    return JSON.parse(String(values[4])) as {
      audit: {
        actorId: string | null;
        actorType: string | null;
        sessionId: string | null;
        sourceRoute: string | null;
        toolName: string | null;
      } | null;
      executionSessionId: string;
      finishedAtUtc: string;
      egressAllowedProviders: string[] | null;
      egressDecision: string;
      egressDeniedProviders: string[] | null;
      egressEnforced: boolean;
      egressProfile: string | null;
      errorMessage: string | null;
      limitsApplied: Record<string, number> | null;
      limitsDecision: string;
      limitsEnforced: boolean;
      limitsProfile: string | null;
      limitsRequested: Record<string, number> | null;
      errorCode: string | null;
      operation: string;
      startedAtUtc: string;
    };
  };

  test('uses fallback path when execution plane is disabled', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);
    const fallback = jest.fn(async () => ({ ok: true }));

    const result = await service.executeWithFallback(
      'draft_orchestration',
      fallback,
    );

    expect(service.isEnabled()).toBe(false);
    expect(service.getMode()).toBe('fallback_only');
    expect(result).toEqual({ ok: true });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(queryable.query).toHaveBeenCalledTimes(1);
    expect(queryable.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO ux_events'),
      expect.arrayContaining([
        'sandbox_execution_attempt',
        'ok',
        expect.any(Number),
        'sandbox_execution',
        expect.any(String),
      ]),
    );
  });

  test('keeps fallback path in phase A even when flag is enabled', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(true, queryable);
    const fallback = jest.fn(async () => 'fallback-result');

    const result = await service.executeWithFallback(
      'live_session_tool',
      fallback,
    );

    expect(service.isEnabled()).toBe(true);
    expect(service.getMode()).toBe('sandbox_enabled');
    expect(result).toBe('fallback-result');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(queryable.query).toHaveBeenCalledTimes(1);
  });

  test('rejects empty operation name for fallback wrapper', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);

    await expect(
      service.executeWithFallback('  ', async () => 'ignored'),
    ).rejects.toThrow(ServiceError);
    await expect(
      service.executeWithFallback('  ', async () => 'ignored'),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_OPERATION_INVALID',
    });
    expect(queryable.query).not.toHaveBeenCalled();
  });

  test('sandbox lifecycle operations support local adapter flow', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(true, queryable);
    const sandbox = await service.createSandbox({
      limits: { timeoutMs: 5000, ttlSeconds: 60 },
    });

    expect(sandbox.sandboxId).toMatch(/^sbx_[a-f0-9]{32}$/);
    const upload = await service.uploadFiles({
      sandboxId: sandbox.sandboxId,
      files: [
        {
          contentBase64: Buffer.from('hello sandbox', 'utf8').toString(
            'base64',
          ),
          path: 'input.txt',
        },
      ],
    });
    expect(upload.uploadedCount).toBe(1);

    const commandResult = await service.runCommand({
      sandboxId: sandbox.sandboxId,
      command:
        process.platform === 'win32'
          ? 'Get-Content input.txt'
          : 'cat input.txt',
    });
    expect(commandResult.exitCode).toBe(0);
    expect(commandResult.stdout).toContain('hello sandbox');

    const codeResult = await service.runCode({
      sandboxId: sandbox.sandboxId,
      language: 'javascript',
      code: "console.log('sandbox code ok')",
    });
    expect(codeResult.output).toContain('sandbox code ok');

    const artifacts = await service.downloadArtifacts({
      sandboxId: sandbox.sandboxId,
      paths: ['input.txt'],
    });
    expect(artifacts.artifacts).toHaveLength(1);
    expect(
      Buffer.from(artifacts.artifacts[0].contentBase64, 'base64').toString(
        'utf8',
      ),
    ).toBe('hello sandbox');

    await expect(
      service.destroySandbox({ sandboxId: sandbox.sandboxId }),
    ).resolves.toBeUndefined();
    await expect(
      service.runCommand({
        sandboxId: sandbox.sandboxId,
        command: process.platform === 'win32' ? 'echo test' : 'echo test',
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_SANDBOX_NOT_FOUND',
    });
  });

  test('emits failed telemetry and rethrows fallback errors', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);
    const failure = new ServiceError(
      'AI_RUNTIME_INVALID_PROMPT',
      'bad prompt',
      400,
    );

    await expect(
      service.executeWithFallback('ai_runtime_dry_run', () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(queryable.query).toHaveBeenCalledTimes(1);
    expect(queryable.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO ux_events'),
      expect.arrayContaining([
        'sandbox_execution_attempt',
        'failed',
        expect.any(Number),
        'sandbox_execution',
        expect.any(String),
      ]),
    );
  });

  test('applies egress profile mapping into telemetry metadata', async () => {
    const queryable = createQueryable();
    const egressProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'openai_api'],
      ['*', 'internal_webhook'],
    ]);
    const service = new SandboxExecutionServiceImpl(
      false,
      queryable,
      egressProfiles,
    );

    await service.executeWithFallback('ai_runtime_dry_run', async () => 'ok');

    const [, values] = queryable.query.mock.calls.at(-1) as [string, unknown[]];
    const metadata = JSON.parse(String(values[4])) as {
      egressDecision: string;
      egressEnforced: boolean;
      operation: string;
      egressProfile: string | null;
    };
    expect(metadata.operation).toBe('ai_runtime_dry_run');
    expect(metadata.egressProfile).toBe('openai_api');
    expect(metadata.egressEnforced).toBe(false);
    expect(metadata.egressDecision).toBe('not_enforced');
  });

  test('rejects request when timeout exceeds enforced limit profile', async () => {
    const queryable = createQueryable();
    const operationLimitProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'runtime_default'],
    ]);
    const limitProfiles = new Map([
      [
        'runtime_default',
        {
          timeoutMs: 12_000,
          ttlSeconds: 900,
          maxArtifactBytes: 10_000_000,
        },
      ],
    ]);
    const service = new SandboxExecutionServiceImpl(
      false,
      queryable,
      new Map(),
      new Map(),
      false,
      operationLimitProfiles,
      limitProfiles,
      true,
    );
    const fallback = jest.fn(async () => 'ignored');

    await expect(
      service.executeWithFallback('ai_runtime_dry_run', fallback, {
        requestedLimits: { timeoutMs: 15_000 },
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_LIMITS_EXCEEDED',
    });

    expect(fallback).not.toHaveBeenCalled();
    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.limitsProfile).toBe('runtime_default');
    expect(metadata.limitsEnforced).toBe(true);
    expect(metadata.limitsDecision).toBe('deny');
    expect(metadata.limitsApplied).toEqual({
      timeoutMs: 12_000,
      ttlSeconds: 900,
      maxArtifactBytes: 10_000_000,
    });
    expect(metadata.limitsRequested).toEqual({ timeoutMs: 15_000 });
    expect(metadata.errorCode).toBe('SANDBOX_EXECUTION_LIMITS_EXCEEDED');
  });

  test('enforces profile timeout boundary while running fallback', async () => {
    const queryable = createQueryable();
    const operationLimitProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'runtime_default'],
    ]);
    const limitProfiles = new Map([
      [
        'runtime_default',
        {
          timeoutMs: 25,
          ttlSeconds: 900,
          maxArtifactBytes: 10_000_000,
        },
      ],
    ]);
    const service = new SandboxExecutionServiceImpl(
      false,
      queryable,
      new Map(),
      new Map(),
      false,
      operationLimitProfiles,
      limitProfiles,
      true,
    );

    await expect(
      service.executeWithFallback('ai_runtime_dry_run', async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 60);
        });
        return 'late';
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_TIMEOUT',
    });

    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.limitsProfile).toBe('runtime_default');
    expect(metadata.limitsDecision).toBe('allow');
    expect(metadata.errorCode).toBe('SANDBOX_EXECUTION_TIMEOUT');
  });

  test('records non-enforced limit metadata when enforcement is disabled', async () => {
    const queryable = createQueryable();
    const operationLimitProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'runtime_default'],
    ]);
    const limitProfiles = new Map([
      [
        'runtime_default',
        {
          timeoutMs: 12_000,
          ttlSeconds: 900,
          maxArtifactBytes: 10_000_000,
        },
      ],
    ]);
    const service = new SandboxExecutionServiceImpl(
      false,
      queryable,
      new Map(),
      new Map(),
      false,
      operationLimitProfiles,
      limitProfiles,
      false,
    );

    await service.executeWithFallback('ai_runtime_dry_run', async () => 'ok', {
      requestedLimits: { timeoutMs: 10_000 },
    });

    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.limitsProfile).toBe('runtime_default');
    expect(metadata.limitsEnforced).toBe(false);
    expect(metadata.limitsDecision).toBe('not_enforced');
    expect(metadata.limitsRequested).toEqual({ timeoutMs: 10_000 });
    expect(metadata.errorCode).toBeNull();
  });

  test('records audit envelope metadata when provided in policy context', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);

    await service.executeWithFallback('ai_runtime_dry_run', async () => 'ok', {
      audit: {
        actorId: 'admin-user-1',
        actorType: 'admin',
        sessionId: 'session-123',
        sourceRoute: '/api/admin/ai-runtime/dry-run',
        toolName: 'aiRuntime.runWithFailover',
      },
    });

    const [, values] = queryable.query.mock.calls.at(-1) as [string, unknown[]];
    const metadata = JSON.parse(String(values[4])) as {
      audit: {
        actorId: string | null;
        actorType: string | null;
        sessionId: string | null;
        sourceRoute: string | null;
        toolName: string | null;
      } | null;
    };
    expect(metadata.audit).toEqual({
      actorId: 'admin-user-1',
      actorType: 'admin',
      sessionId: 'session-123',
      sourceRoute: '/api/admin/ai-runtime/dry-run',
      toolName: 'aiRuntime.runWithFailover',
    });
    expect(typeof metadata.executionSessionId).toBe('string');
    expect(metadata.executionSessionId.length).toBeGreaterThan(0);
    expect(metadata.startedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.finishedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(metadata.finishedAtUtc).valueOf()).toBeGreaterThanOrEqual(
      new Date(metadata.startedAtUtc).valueOf(),
    );
  });

  test('injects execution session id into audit envelope when session id is absent', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);

    await service.executeWithFallback('ai_runtime_dry_run', async () => 'ok', {
      audit: {
        actorType: 'admin',
        sourceRoute: '/api/admin/ai-runtime/dry-run',
        toolName: 'aiRuntime.runWithFailover',
      },
    });

    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.audit).toMatchObject({
      actorType: 'admin',
      sourceRoute: '/api/admin/ai-runtime/dry-run',
      toolName: 'aiRuntime.runWithFailover',
      sessionId: metadata.executionSessionId,
    });
  });

  test('redacts sensitive audit metadata values before telemetry is stored', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);

    await service.executeWithFallback('ai_runtime_dry_run', async () => 'ok', {
      audit: {
        actorId: 'admin-user-1',
        sourceRoute:
          '/api/admin/ai-runtime/dry-run?token=secret-token-value-123456',
        toolName: 'Authorization=Bearer eyJhbGciOiJub25lIn0.payload.signature',
      },
    });

    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.audit).toMatchObject({
      actorId: 'admin-user-1',
      sourceRoute: '/api/admin/ai-runtime/dry-run?token=<redacted>',
    });
    expect(metadata.audit?.toolName).toContain('Authorization=<redacted>');
    expect(metadata.audit?.toolName).not.toContain('payload.signature');
  });

  test('redacts sensitive values in telemetry error message', async () => {
    const queryable = createQueryable();
    const service = new SandboxExecutionServiceImpl(false, queryable);

    await expect(
      service.executeWithFallback('ai_runtime_dry_run', () => {
        throw new ServiceError(
          'SANDBOX_EXECUTION_LIMITS_EXCEEDED',
          'Provider request failed token=abc12345 apiKey=xyz98765',
          400,
        );
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_LIMITS_EXCEEDED',
    });

    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.errorMessage).toContain('token=<redacted>');
    expect(metadata.errorMessage).toContain('apiKey=<redacted>');
    expect(metadata.errorMessage).not.toContain('abc12345');
    expect(metadata.errorMessage).not.toContain('xyz98765');
  });

  test('enforces provider allowlist and blocks denied provider execution', async () => {
    const queryable = createQueryable();
    const egressProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'openai_api'],
    ]);
    const egressProviderAllowlists = new Map<string, string[]>([
      ['openai_api', ['gpt-4.1']],
    ]);
    const service = new SandboxExecutionServiceImpl(
      true,
      queryable,
      egressProfiles,
      egressProviderAllowlists,
      true,
    );
    const fallback = jest.fn(async () => 'should-not-run');

    await expect(
      service.executeWithFallback('ai_runtime_dry_run', fallback, {
        providerIdentifiers: ['claude-4'],
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_EXECUTION_EGRESS_POLICY_DENY',
    });

    expect(fallback).not.toHaveBeenCalled();
    expect(queryable.query).toHaveBeenCalledTimes(1);
    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.operation).toBe('ai_runtime_dry_run');
    expect(metadata.egressProfile).toBe('openai_api');
    expect(metadata.egressEnforced).toBe(true);
    expect(metadata.egressDecision).toBe('deny');
    expect(metadata.egressDeniedProviders).toEqual(['claude-4']);
    expect(metadata.errorCode).toBe('SANDBOX_EXECUTION_EGRESS_POLICY_DENY');
  });

  test('allows execution when provider is listed in enforced allowlist', async () => {
    const queryable = createQueryable();
    const egressProfiles = new Map<string, string>([
      ['ai_runtime_dry_run', 'openai_api'],
    ]);
    const egressProviderAllowlists = new Map<string, string[]>([
      ['openai_api', ['gpt-4.1']],
    ]);
    const service = new SandboxExecutionServiceImpl(
      true,
      queryable,
      egressProfiles,
      egressProviderAllowlists,
      true,
    );
    const fallback = jest.fn(async () => 'ok');

    const result = await service.executeWithFallback(
      'ai_runtime_dry_run',
      fallback,
      {
        providerIdentifiers: ['gpt-4.1'],
      },
    );

    expect(result).toBe('ok');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(queryable.query).toHaveBeenCalledTimes(1);
    const metadata = getLastTelemetryMetadata(queryable);
    expect(metadata.egressDecision).toBe('allow');
    expect(metadata.egressAllowedProviders).toEqual(['gpt-4.1']);
    expect(metadata.egressDeniedProviders).toBeNull();
    expect(metadata.errorCode).toBeNull();
    expect(metadata.limitsDecision).toBe('not_enforced');
  });
});
