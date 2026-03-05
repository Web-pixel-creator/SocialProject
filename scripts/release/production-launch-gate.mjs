import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ALLOWED_EXTERNAL_CHANNELS,
  parseExternalChannelsList,
} from './dispatch-production-launch-gate-external-channels.mjs';
import {
  parseReleaseBooleanEnv,
  parseReleasePositiveIntegerEnv,
} from './release-env-parse-utils.mjs';
import {
  resolveProductionBooleanConfig,
  resolveProductionStringConfig,
} from './production-launch-gate-config-resolvers.mjs';
import { buildProductionLaunchGateFailureLines } from './production-launch-gate-failure-output-format.mjs';

const DEFAULTS = {
  apiService: process.env.RAILWAY_API_SERVICE || 'api',
  artifactsDir: 'artifacts/release',
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'production',
  failureDetailMaxItems: parseReleasePositiveIntegerEnv(
    process.env.RELEASE_FAILURE_DETAIL_MAX_ITEMS,
    10,
    'RELEASE_FAILURE_DETAIL_MAX_ITEMS',
  ),
  gateIntervalMs: 15_000,
  gateWaitMs: 300_000,
  httpTimeoutMs: 10_000,
  runtimeChannel: process.env.RELEASE_RUNTIME_CHANNEL || 'release_runtime_probe',
  smokeResultsPath:
    process.env.RELEASE_RESULTS_PATH ||
    'artifacts/release/smoke-results-production-postdeploy.json',
  webService: process.env.RAILWAY_WEB_SERVICE || 'SocialProject',
};

const RELEASE_FALLBACK_ENV = {
  adminToken: 'RELEASE_ADMIN_API_TOKEN',
  apiBaseUrl: 'RELEASE_API_BASE_URL',
  csrfToken: 'RELEASE_CSRF_TOKEN',
  webBaseUrl: 'RELEASE_WEB_BASE_URL',
  webhookSecret: 'RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET',
};

const ARTIFACTS = {
  adapters: 'artifacts/release/production-agent-gateway-adapters.json',
  adminHealth: 'artifacts/release/production-admin-health-summary.json',
  externalChannelTraces:
    'artifacts/release/production-agent-gateway-external-channel-traces.json',
  healthSummary: 'artifacts/release/production-launch-gate-health-summary.json',
  ingestProbe: 'artifacts/release/production-agent-gateway-ingest-probe.json',
  matrixProbe:
    'artifacts/release/production-agent-gateway-adapter-matrix-probe.json',
  railwayGate: 'artifacts/release/railway-gate-strict.json',
  runtimeProbe: 'artifacts/release/production-runtime-orchestration-probe.json',
  sandboxExecutionAuditPolicy:
    'artifacts/release/production-sandbox-execution-audit-policy.json',
  sandboxExecutionEgressPolicy:
    'artifacts/release/production-sandbox-execution-egress-policy.json',
  sandboxExecutionLimitsPolicy:
    'artifacts/release/production-sandbox-execution-limits-policy.json',
  sandboxExecutionMetrics:
    'artifacts/release/production-sandbox-execution-metrics.json',
  summary: 'artifacts/release/production-launch-gate-summary.json',
  telemetry: 'artifacts/release/production-agent-gateway-telemetry.json',
};

const EXPECTED_CRON_JOBS = [
  'budgets_reset',
  'glowup_reel',
  'autopsy_report',
  'retention_cleanup',
  'embedding_backfill',
];
const EXTERNAL_CHANNELS = [...ALLOWED_EXTERNAL_CHANNELS];
const SANDBOX_EGRESS_OPERATION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SANDBOX_EGRESS_PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SANDBOX_EGRESS_WILDCARD_KEY = '*';
const SANDBOX_LIMIT_PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SANDBOX_RUNTIME_PROBE_OPERATION = 'ai_runtime_dry_run';
const SANDBOX_RUNTIME_REQUIRED_AUDIT_FIELDS = [
  'actorType',
  'sourceRoute',
  'toolName',
];
const REQUIRED_SMOKE_STEP_NAMES = [
  'api.health',
  'api.ready',
  'api.draft.create',
  'api.draft.get',
  'api.draft.list',
  'api.pr.submit',
  'api.pr.decide',
  'api.search',
  'web.home',
  'web.feed',
  'web.search',
  'web.draft.detail',
];

const sortDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortDeep(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortDeep(value[key]);
  }
  return out;
};

const normalizeLower = (value) => value.trim().toLowerCase();
const parseSandboxExecutionEgressProfiles = (rawValue, sourceLabel) => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return new Map();
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} has invalid JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  const map = new Map();
  for (const [operationRaw, profileRaw] of Object.entries(parsed)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" must map to a string profile.`,
      );
    }
    const operation = normalizeLower(operationRaw);
    const profile = normalizeLower(profileRaw);
    if (
      operation !== SANDBOX_EGRESS_WILDCARD_KEY &&
      !SANDBOX_EGRESS_OPERATION_PATTERN.test(operation)
    ) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid operation id.`,
      );
    }
    if (!SANDBOX_EGRESS_PROFILE_PATTERN.test(profile)) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid profile id.`,
      );
    }
    map.set(operation, profile);
  }
  return map;
};
const resolveSandboxExecutionEgressProfile = (profiles, operation) => {
  const normalized = normalizeLower(operation);
  if (profiles.has(normalized)) {
    return profiles.get(normalized) || null;
  }
  if (profiles.has(SANDBOX_EGRESS_WILDCARD_KEY)) {
    return profiles.get(SANDBOX_EGRESS_WILDCARD_KEY) || null;
  }
  return null;
};
const resolveSandboxExecutionEgressProfilesConfig = (apiServiceVars) => {
  const candidates = [
    {
      raw: process.env.RELEASE_SANDBOX_EXECUTION_EGRESS_PROFILES,
      source: 'RELEASE_SANDBOX_EXECUTION_EGRESS_PROFILES',
    },
    {
      raw: process.env.SANDBOX_EXECUTION_EGRESS_PROFILES,
      source: 'SANDBOX_EXECUTION_EGRESS_PROFILES',
    },
    {
      raw:
        apiServiceVars && typeof apiServiceVars === 'object'
          ? apiServiceVars.SANDBOX_EXECUTION_EGRESS_PROFILES
          : '',
      source: 'Railway api service variable SANDBOX_EXECUTION_EGRESS_PROFILES',
    },
  ];
  return resolveProductionStringConfig({
    candidates,
    fallback: '',
  });
};
const resolveSandboxExecutionEgressEnforceConfig = (apiServiceVars) => {
  const candidates = [
    {
      raw: process.env.RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE,
      source: 'RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE',
    },
    {
      raw: process.env.SANDBOX_EXECUTION_EGRESS_ENFORCE,
      source: 'SANDBOX_EXECUTION_EGRESS_ENFORCE',
    },
    {
      raw:
        apiServiceVars && typeof apiServiceVars === 'object'
          ? apiServiceVars.SANDBOX_EXECUTION_EGRESS_ENFORCE
          : '',
      source: 'Railway api service variable SANDBOX_EXECUTION_EGRESS_ENFORCE',
    },
  ];
  return resolveProductionBooleanConfig({
    candidates,
    fallback: false,
  });
};
const parseSandboxExecutionOperationLimitProfiles = (rawValue, sourceLabel) => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return new Map();
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} has invalid JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  const map = new Map();
  for (const [operationRaw, profileRaw] of Object.entries(parsed)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" must map to a string profile.`,
      );
    }
    const operation = normalizeLower(operationRaw);
    const profile = normalizeLower(profileRaw);
    if (
      operation !== SANDBOX_EGRESS_WILDCARD_KEY &&
      !SANDBOX_EGRESS_OPERATION_PATTERN.test(operation)
    ) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid operation id.`,
      );
    }
    if (!SANDBOX_LIMIT_PROFILE_PATTERN.test(profile)) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid profile id.`,
      );
    }
    map.set(operation, profile);
  }
  return map;
};
const resolveSandboxExecutionOperationLimitProfile = (profiles, operation) => {
  const normalized = normalizeLower(operation);
  if (profiles.has(normalized)) {
    return profiles.get(normalized) || null;
  }
  if (profiles.has(SANDBOX_EGRESS_WILDCARD_KEY)) {
    return profiles.get(SANDBOX_EGRESS_WILDCARD_KEY) || null;
  }
  return null;
};
const resolveSandboxExecutionOperationLimitProfilesConfig = (apiServiceVars) => {
  const candidates = [
    {
      raw: process.env.RELEASE_SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES,
      source: 'RELEASE_SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
    },
    {
      raw: process.env.SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES,
      source: 'SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
    },
    {
      raw:
        apiServiceVars && typeof apiServiceVars === 'object'
          ? apiServiceVars.SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES
          : '',
      source:
        'Railway api service variable SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
    },
  ];
  return resolveProductionStringConfig({
    candidates,
    fallback: '',
  });
};
const resolveSandboxExecutionLimitsEnforceConfig = (apiServiceVars) => {
  const candidates = [
    {
      raw: process.env.RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE,
      source: 'RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE',
    },
    {
      raw: process.env.SANDBOX_EXECUTION_LIMITS_ENFORCE,
      source: 'SANDBOX_EXECUTION_LIMITS_ENFORCE',
    },
    {
      raw:
        apiServiceVars && typeof apiServiceVars === 'object'
          ? apiServiceVars.SANDBOX_EXECUTION_LIMITS_ENFORCE
          : '',
      source: 'Railway api service variable SANDBOX_EXECUTION_LIMITS_ENFORCE',
    },
  ];
  return resolveProductionBooleanConfig({
    candidates,
    fallback: false,
  });
};
const resolveSandboxExecutionEnabledConfig = (apiServiceVars) => {
  const candidates = [
    {
      raw: process.env.RELEASE_SANDBOX_EXECUTION_ENABLED,
      source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
    },
    {
      raw: process.env.SANDBOX_EXECUTION_ENABLED,
      source: 'SANDBOX_EXECUTION_ENABLED',
    },
    {
      raw:
        apiServiceVars && typeof apiServiceVars === 'object'
          ? apiServiceVars.SANDBOX_EXECUTION_ENABLED
          : '',
      source: 'Railway api service variable SANDBOX_EXECUTION_ENABLED',
    },
  ];
  return resolveProductionBooleanConfig({
    candidates,
    fallback: false,
  });
};
const resolveSandboxExecutionMode = (sandboxExecutionEnabled) =>
  sandboxExecutionEnabled ? 'sandbox_enabled' : 'fallback_only';
const summarizeSandboxExecutionModeConsistency = (
  modeBreakdown,
  expectedMode,
) => {
  const rows = Array.isArray(modeBreakdown) ? modeBreakdown : [];
  let expectedModeCount = 0;
  let otherModeCount = 0;
  let total = 0;

  for (const row of rows) {
    const mode =
      row && typeof row === 'object' && typeof row.mode === 'string'
        ? row.mode.trim().toLowerCase()
        : 'unknown';
    const countRaw = Number(
      row && typeof row === 'object' ? row.count ?? 0 : 0,
    );
    const count = Number.isFinite(countRaw) ? Math.max(0, countRaw) : 0;
    total += count;
    if (mode === expectedMode) {
      expectedModeCount += count;
    } else {
      otherModeCount += count;
    }
  }

  return {
    expectedMode,
    expectedModeCount,
    otherModeCount,
    pass: total > 0 && expectedModeCount === total && otherModeCount === 0,
    total,
  };
};

const quote = (v) =>
  /^[a-z0-9_./:=@+-]+$/i.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`;

const runRaw = (command, args = [], env = process.env) => {
  const full = [command, ...args.map(quote)].join(' ');
  return { ...spawnSync(full, { encoding: 'utf8', env, shell: true }), full };
};

const run = (command, args = [], env = process.env) => {
  const res = runRaw(command, args, env);
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(res.stderr.trim() || res.stdout.trim() || `${res.full} failed`);
  }
  return res.stdout;
};

const isMissingCommand = (res) => {
  const stderr = String(res?.stderr || '').toLowerCase();
  const stdout = String(res?.stdout || '').toLowerCase();
  return (
    res?.error?.code === 'ENOENT' ||
    stderr.includes('not recognized as an internal or external command') ||
    stderr.includes('command not found') ||
    stdout.includes('not recognized as an internal or external command') ||
    stdout.includes('command not found')
  );
};

const runRailway = (args, env = process.env) => {
  const primary = runRaw('railway', args, env);
  if (!primary.error && primary.status === 0) {
    return primary.stdout;
  }
  if (!isMissingCommand(primary)) {
    throw new Error(
      primary.stderr.trim() || primary.stdout.trim() || 'railway command failed',
    );
  }
  const fallback = runRaw('npx', ['-y', '@railway/cli', ...args], env);
  if (fallback.error) throw fallback.error;
  if (fallback.status !== 0) {
    throw new Error(
      fallback.stderr.trim() || fallback.stdout.trim() || 'npx @railway/cli failed',
    );
  }
  return fallback.stdout;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeJson = async (file, data) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const hasConnectorProfilesSnapshot = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.profiles) &&
      Number.isFinite(value.total),
  );
const buildSmokeStepStatus = (smokeReport) => {
  const steps = Array.isArray(smokeReport?.steps) ? smokeReport.steps : [];
  const byName = new Map(
    steps
      .filter(
        (step) =>
          step &&
          typeof step === 'object' &&
          typeof step.name === 'string' &&
          step.name.length > 0,
      )
      .map((step) => [step.name, step]),
  );
  const missing = REQUIRED_SMOKE_STEP_NAMES.filter((name) => !byName.has(name));
  const failed = REQUIRED_SMOKE_STEP_NAMES.filter(
    (name) => byName.get(name)?.pass !== true,
  );
  return {
    failed,
    missing,
    pass: missing.length === 0 && failed.length === 0,
    required: REQUIRED_SMOKE_STEP_NAMES,
  };
};
const buildStepPromptCoverage = (steps) =>
  Array.isArray(steps)
    ? steps.map((step) => {
        const prompt = typeof step?.prompt === 'string' ? step.prompt : '';
        const role = String(step?.role ?? 'unknown');
        const hasRolePersona = prompt.includes('Role persona');
        const hasRoleSkill = prompt.includes('Role skill');
        const hasSkillCapsule = prompt.includes('Skill capsule');
        return {
          hasRolePersona,
          hasRoleSkill,
          hasSkillCapsule,
          promptLength: prompt.length,
          role,
        };
      })
    : [];
const buildSkillMarkerCoverage = (stepPromptCoverage) => {
  const hasRolePersonaAllSteps =
    stepPromptCoverage.length > 0 &&
    stepPromptCoverage.every((step) => step.hasRolePersona);
  const hasSkillCapsuleAllSteps =
    stepPromptCoverage.length > 0 &&
    stepPromptCoverage.every((step) => step.hasSkillCapsule);
  const hasRoleSkillAnyStep = stepPromptCoverage.some(
    (step) => step.hasRoleSkill,
  );
  return {
    hasRolePersonaAllSteps,
    hasRoleSkillAnyStep,
    hasSkillCapsuleAllSteps,
    missingRolePersonaRoles: stepPromptCoverage
      .filter((step) => !step.hasRolePersona)
      .map((step) => step.role),
    missingSkillCapsuleRoles: stepPromptCoverage
      .filter((step) => !step.hasSkillCapsule)
      .map((step) => step.role),
    roleSkillPresentRoles: stepPromptCoverage
      .filter((step) => step.hasRoleSkill)
      .map((step) => step.role),
    skillMarkerMultiStepPass:
      hasRolePersonaAllSteps && hasSkillCapsuleAllSteps && hasRoleSkillAnyStep,
  };
};
const resolveExternalChannelProbePayload = ({ channel, suffix }) => {
  if (channel === 'telegram') {
    const chatId = -100_000_000 - Number(suffix.slice(-4));
    return {
      expectedExternalSessionId: `telegram_chat:${chatId}`,
      payload: {
        message: {
          chat: {
            id: chatId,
          },
        },
      },
    };
  }
  if (channel === 'slack') {
    const slackChannelId = `C${suffix.slice(-8).toUpperCase()}`;
    return {
      expectedExternalSessionId: `slack_channel:${slackChannelId.toLowerCase()}`,
      payload: {
        event: {
          channel: slackChannelId,
        },
      },
    };
  }
  const discordChannelId = `${Math.abs(Number(suffix.slice(-12)))}`;
  return {
    expectedExternalSessionId: `discord_channel:${discordChannelId}`,
    payload: {
      channel_id: discordChannelId,
    },
  };
};
const resolveExternalChannelProfiles = (profiles) => {
  const picked = [];
  for (const channel of EXTERNAL_CHANNELS) {
    const profile = profiles.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        String(entry.channel || '').toLowerCase() === channel &&
        String(entry.adapter || '').toLowerCase() === 'external_webhook' &&
        typeof entry.connectorId === 'string' &&
        entry.connectorId.length > 0,
    );
    if (profile) {
      picked.push(profile);
    }
  }
  return picked;
};
const classifyExternalChannelFallbackFailure = (check) => {
  if (!check || typeof check !== 'object' || check.pass) {
    return null;
  }
  if (check.ingestStatus !== 201) {
    return 'ingest_http_error';
  }
  if (check.ingestApplied !== true) {
    return 'ingest_not_applied';
  }
  if (check.sessionsStatus !== 200) {
    return 'sessions_lookup_error';
  }
  if (
    typeof check.expectedExternalSessionId === 'string' &&
    check.expectedExternalSessionId.length > 0 &&
    check.resolvedExternalSessionId !== check.expectedExternalSessionId
  ) {
    return 'fallback_session_mismatch';
  }
  if (check.telemetryStatus !== 200) {
    return 'telemetry_http_error';
  }
  if (Number(check.telemetryTotal || 0) <= 0) {
    return 'telemetry_no_connector_events';
  }
  if (Number(check.telemetryAccepted || 0) <= 0) {
    return 'telemetry_zero_accepted';
  }
  return 'unknown';
};

const parseArgs = (argv) => {
  const o = {
    apiBaseUrl: '',
    apiService: DEFAULTS.apiService,
    environment: DEFAULTS.environment,
    failureDetailMaxItems: DEFAULTS.failureDetailMaxItems,
    gateIntervalMs: DEFAULTS.gateIntervalMs,
    gateWaitMs: DEFAULTS.gateWaitMs,
    help: false,
    httpTimeoutMs: DEFAULTS.httpTimeoutMs,
    json: false,
    requiredExternalChannels: parseExternalChannelsList(
      process.env.RELEASE_REQUIRED_EXTERNAL_CHANNELS || '',
      'RELEASE_REQUIRED_EXTERNAL_CHANNELS',
    ),
    requireSkillMarkers: false,
    requireNaturalCronWindow: parseReleaseBooleanEnv(
      process.env.RELEASE_REQUIRE_NATURAL_CRON_WINDOW,
      false,
      'RELEASE_REQUIRE_NATURAL_CRON_WINDOW',
    ),
    runtimeChannel: DEFAULTS.runtimeChannel,
    runtimeDraftId: process.env.RELEASE_RUNTIME_PROBE_DRAFT_ID || '',
    skipIngestProbe: false,
    skipRailwayGate: false,
    skipRuntimeProbes: false,
    skipSmoke: false,
    smokeResultsPath: DEFAULTS.smokeResultsPath,
    strict: false,
    webBaseUrl: '',
    webService: DEFAULTS.webService,
  };
  const readRequiredValue = (flag, nextValue) => {
    const value = String(nextValue || '').trim();
    if (!value) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };
  const parsePositiveIntegerValue = (flag, nextValue) => {
    const value = readRequiredValue(flag, nextValue);
    return parseReleasePositiveIntegerEnv(value, 0, flag);
  };
  const readInlineValue = (arg, flag) =>
    readRequiredValue(`${flag}=`, arg.slice(`${flag}=`.length));
  const parseInlinePositiveIntegerValue = (arg, flag) =>
    parsePositiveIntegerValue(`${flag}=`, arg.slice(`${flag}=`.length));

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--skip-smoke') o.skipSmoke = true;
    else if (a === '--skip-runtime-probes') o.skipRuntimeProbes = true;
    else if (a === '--skip-ingest-probe') o.skipIngestProbe = true;
    else if (a === '--skip-railway-gate') o.skipRailwayGate = true;
    else if (a === '--required-external-channels') {
      const value = readRequiredValue('--required-external-channels', argv[++i]);
      o.requiredExternalChannels = parseExternalChannelsList(
        value,
        '--required-external-channels',
      );
    } else if (a.startsWith('--required-external-channels=')) {
      const value = a.slice('--required-external-channels='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${a}`);
      }
      o.requiredExternalChannels = parseExternalChannelsList(
        value,
        '--required-external-channels',
      );
    }
    else if (a.startsWith('--environment='))
      o.environment = readInlineValue(a, '--environment');
    else if (a.startsWith('--web-service='))
      o.webService = readInlineValue(a, '--web-service');
    else if (a.startsWith('--api-service='))
      o.apiService = readInlineValue(a, '--api-service');
    else if (a.startsWith('--web-base-url='))
      o.webBaseUrl = readInlineValue(a, '--web-base-url');
    else if (a.startsWith('--api-base-url='))
      o.apiBaseUrl = readInlineValue(a, '--api-base-url');
    else if (a.startsWith('--runtime-draft-id='))
      o.runtimeDraftId = readInlineValue(a, '--runtime-draft-id');
    else if (a.startsWith('--runtime-channel='))
      o.runtimeChannel = readInlineValue(a, '--runtime-channel');
    else if (a.startsWith('--smoke-results-path='))
      o.smokeResultsPath = readInlineValue(a, '--smoke-results-path');
    else if (a.startsWith('--gate-wait-ms='))
      o.gateWaitMs = parseInlinePositiveIntegerValue(a, '--gate-wait-ms');
    else if (a.startsWith('--gate-poll-interval-ms='))
      o.gateIntervalMs = parseInlinePositiveIntegerValue(
        a,
        '--gate-poll-interval-ms',
      );
    else if (a.startsWith('--http-timeout-ms='))
      o.httpTimeoutMs = parseInlinePositiveIntegerValue(a, '--http-timeout-ms');
    else if (a.startsWith('--failure-detail-max-items='))
      o.failureDetailMaxItems = parseInlinePositiveIntegerValue(
        a,
        '--failure-detail-max-items',
      );
    else if (a === '--require-skill-markers') o.requireSkillMarkers = true;
    else if (a === '--require-natural-cron-window')
      o.requireNaturalCronWindow = true;
    else if (a === '--environment')
      o.environment = readRequiredValue('--environment', argv[++i]);
    else if (a === '--web-service')
      o.webService = readRequiredValue('--web-service', argv[++i]);
    else if (a === '--api-service')
      o.apiService = readRequiredValue('--api-service', argv[++i]);
    else if (a === '--web-base-url')
      o.webBaseUrl = readRequiredValue('--web-base-url', argv[++i]);
    else if (a === '--api-base-url')
      o.apiBaseUrl = readRequiredValue('--api-base-url', argv[++i]);
    else if (a === '--runtime-draft-id')
      o.runtimeDraftId = readRequiredValue('--runtime-draft-id', argv[++i]);
    else if (a === '--runtime-channel')
      o.runtimeChannel = readRequiredValue('--runtime-channel', argv[++i]);
    else if (a === '--smoke-results-path')
      o.smokeResultsPath = readRequiredValue('--smoke-results-path', argv[++i]);
    else if (a === '--gate-wait-ms')
      o.gateWaitMs = parsePositiveIntegerValue('--gate-wait-ms', argv[++i]);
    else if (a === '--gate-poll-interval-ms')
      o.gateIntervalMs = parsePositiveIntegerValue(
        '--gate-poll-interval-ms',
        argv[++i],
      );
    else if (a === '--http-timeout-ms')
      o.httpTimeoutMs = parsePositiveIntegerValue(
        '--http-timeout-ms',
        argv[++i],
      );
    else if (a === '--failure-detail-max-items')
      o.failureDetailMaxItems = parsePositiveIntegerValue(
        '--failure-detail-max-items',
        argv[++i],
      );
    else throw new Error(`Unknown argument: ${a}`);
  }
  return o;
};

const printHelp = () => {
  process.stdout.write(
    [
      'Usage: node scripts/release/production-launch-gate.mjs [options]',
      '',
      'Options:',
      '  --strict --json',
      '  --environment <name> --web-service <name> --api-service <name>',
      '  --web-base-url <url> --api-base-url <url>',
      '  --runtime-draft-id <uuid> --runtime-channel <name>',
      '  --skip-railway-gate --skip-smoke --skip-runtime-probes --skip-ingest-probe',
      '  --failure-detail-max-items <n>',
      '  --required-external-channels <telegram,slack,discord|all>',
      '  --require-skill-markers',
      '  --require-natural-cron-window',
      '',
    ].join('\n'),
  );
};

const postOrGet = async ({
  adminToken,
  apiBaseUrl,
  body,
  csrfToken,
  headers = {},
  method = 'GET',
  pathName,
  timeoutMs,
  useAdmin = false,
}) => {
  const url = new URL(pathName, apiBaseUrl).toString();
  const h = { ...headers };
  if (useAdmin) h['x-admin-token'] = adminToken;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) h['x-csrf-token'] = csrfToken;
  let bodyText;
  if (body !== undefined) {
    h['content-type'] = 'application/json';
    bodyText = JSON.stringify(body);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method, headers: h, body: bodyText, signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON response body is expected for some probe failures.
      json = null;
    }
    return { json, ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(t);
  }
};

const main = async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();
  await mkdir(path.resolve(DEFAULTS.artifactsDir), { recursive: true });

  const summary = {
    artifacts: { ...ARTIFACTS, smoke: o.smokeResultsPath },
    checks: {},
    config: { ...o, help: undefined },
    generatedAtUtc: new Date().toISOString(),
    pass: false,
    status: 'running',
  };

  try {
    let gate = null;
    if (!o.skipRailwayGate) {
      const start = Date.now();
      while (true) {
        const result = runRaw('node', [
          path.resolve('scripts/release/railway-production-gate.mjs'),
          '--json',
          '--require-api-service',
          '--environment',
          o.environment,
          '--web-service',
          o.webService,
          '--api-service',
          o.apiService,
          ...(o.strict ? ['--strict'] : []),
        ]);
        if (result.error) {
          throw result.error;
        }
        const payload = result.stdout.trim();
        if (!payload) {
          throw new Error(
            result.stderr.trim() ||
              'railway production gate returned empty output',
          );
        }
        gate = JSON.parse(payload);
        await writeJson(path.resolve(ARTIFACTS.railwayGate), gate);
        if (gate.status === 'pass') break;
        const transient =
          Array.isArray(gate.failures) &&
          gate.failures.length > 0 &&
          gate.failures.every((f) => f.code === 'DEPLOYMENT_NOT_SUCCESS') &&
          Array.isArray(gate.services) &&
          gate.services.some((s) =>
            ['BUILDING', 'DEPLOYING', 'INITIALIZING'].includes(
              s.deploymentStatus,
            ),
          );
        if (!transient || Date.now() - start > o.gateWaitMs) {
          throw new Error('Railway strict gate failed');
        }
        await sleep(o.gateIntervalMs);
      }
    }
    summary.checks.railwayGate = { pass: true, skipped: o.skipRailwayGate };

    const services = Array.isArray(gate?.services) ? gate.services : [];
    const findService = (name) =>
      services.find((s) => (s.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    const apiBaseUrl =
      o.apiBaseUrl ||
      process.env[RELEASE_FALLBACK_ENV.apiBaseUrl] ||
      findService(o.apiService)?.publicBaseUrl;
    const webBaseUrl =
      o.webBaseUrl ||
      process.env[RELEASE_FALLBACK_ENV.webBaseUrl] ||
      findService(o.webService)?.publicBaseUrl;
    if (!apiBaseUrl || !webBaseUrl) throw new Error('Unable to resolve production base URLs');

    let adminToken = String(
      process.env[RELEASE_FALLBACK_ENV.adminToken] || '',
    ).trim();
    let csrfToken = String(process.env[RELEASE_FALLBACK_ENV.csrfToken] || '').trim();
    let webhookSecret = String(
      process.env[RELEASE_FALLBACK_ENV.webhookSecret] || '',
    ).trim();
    let apiServiceVars = null;
    if (!adminToken || !csrfToken || !webhookSecret) {
      const vars = JSON.parse(
        runRailway([
          'variable',
          'list',
          '--service',
          o.apiService,
          '--environment',
          o.environment,
          '--json',
        ]),
      );
      apiServiceVars = vars;
      adminToken ||= String(vars.ADMIN_API_TOKEN || '').trim();
      csrfToken ||= String(vars.CSRF_TOKEN || '').trim();
      webhookSecret ||= String(vars.AGENT_GATEWAY_WEBHOOK_SECRET || '').trim();
    }
    if (!adminToken || !csrfToken || !webhookSecret) {
      const missing = [];
      if (!adminToken) missing.push('ADMIN_API_TOKEN');
      if (!csrfToken) missing.push('CSRF_TOKEN');
      if (!webhookSecret) missing.push('AGENT_GATEWAY_WEBHOOK_SECRET');
      throw new Error(
        `Missing required API secrets: ${missing.join(', ')}. Provide Railway access or set ${RELEASE_FALLBACK_ENV.adminToken}/${RELEASE_FALLBACK_ENV.csrfToken}/${RELEASE_FALLBACK_ENV.webhookSecret}.`,
      );
    }
    if (!apiServiceVars) {
      try {
        apiServiceVars = JSON.parse(
          runRailway([
            'variable',
            'list',
            '--service',
            o.apiService,
            '--environment',
            o.environment,
            '--json',
          ]),
        );
      } catch {
        apiServiceVars = null;
      }
    }
    const sandboxExecutionEgressConfig = resolveSandboxExecutionEgressProfilesConfig(
      apiServiceVars,
    );
    const sandboxExecutionEgressProfiles = parseSandboxExecutionEgressProfiles(
      sandboxExecutionEgressConfig.value,
      sandboxExecutionEgressConfig.source,
    );
    const runtimeDryRunEgressProfile = resolveSandboxExecutionEgressProfile(
      sandboxExecutionEgressProfiles,
      SANDBOX_RUNTIME_PROBE_OPERATION,
    );
    const sandboxExecutionEgressEnforceConfig = resolveSandboxExecutionEgressEnforceConfig(
      apiServiceVars,
    );
    const sandboxExecutionOperationLimitProfilesConfig =
      resolveSandboxExecutionOperationLimitProfilesConfig(apiServiceVars);
    const sandboxExecutionOperationLimitProfiles =
      parseSandboxExecutionOperationLimitProfiles(
        sandboxExecutionOperationLimitProfilesConfig.value,
        sandboxExecutionOperationLimitProfilesConfig.source,
      );
    const runtimeDryRunLimitProfile = resolveSandboxExecutionOperationLimitProfile(
      sandboxExecutionOperationLimitProfiles,
      SANDBOX_RUNTIME_PROBE_OPERATION,
    );
    const sandboxExecutionLimitsEnforceConfig =
      resolveSandboxExecutionLimitsEnforceConfig(apiServiceVars);
    const sandboxExecutionEnabledConfig =
      resolveSandboxExecutionEnabledConfig(apiServiceVars);
    const runtimeDryRunExpectedMode = resolveSandboxExecutionMode(
      sandboxExecutionEnabledConfig.value,
    );

    if (!o.skipSmoke) {
      run('node', [path.resolve('scripts/release/smoke-check.mjs')], {
        ...process.env,
        RELEASE_API_BASE_URL: apiBaseUrl,
        RELEASE_WEB_BASE_URL: webBaseUrl,
        RELEASE_CSRF_TOKEN: csrfToken,
        RELEASE_RESULTS_PATH: path.resolve(o.smokeResultsPath),
      });
    }
    const smoke = await readJson(path.resolve(o.smokeResultsPath));
    if (!smoke.summary?.pass) throw new Error('Production smoke failed');
    const smokeStepStatus = buildSmokeStepStatus(smoke);
    summary.checks.smokeRequiredSteps = {
      ...smokeStepStatus,
      skipped: o.skipSmoke,
    };
    if (!smokeStepStatus.pass) {
      throw new Error(
        `Production smoke required steps failed (missing: ${smokeStepStatus.missing.join(', ') || 'none'}; failed: ${smokeStepStatus.failed.join(', ') || 'none'}).`,
      );
    }
    summary.checks.smoke = { pass: true, skipped: o.skipSmoke };

    const runtimeDraftId = o.runtimeDraftId || smoke.context?.draftId;
    if (o.requireSkillMarkers && !o.runtimeDraftId) {
      throw new Error(
        '--require-skill-markers requires explicit --runtime-draft-id (or RELEASE_RUNTIME_PROBE_DRAFT_ID) that points to a draft with configured skill markers.',
      );
    }
    if (o.skipIngestProbe && o.requiredExternalChannels.length > 0) {
      throw new Error(
        '--required-external-channels cannot be combined with --skip-ingest-probe.',
      );
    }
    if (!runtimeDraftId) throw new Error('Runtime draft id is missing');

    const health = {};
    for (const p of [
      ['/health', false],
      ['/ready', false],
      ['/api/admin/system/metrics', true],
      ['/api/admin/embeddings/metrics', true],
      ['/api/admin/ai-runtime/health', true],
      ['/api/admin/sandbox-execution/metrics?hours=24&limit=20', true],
      ['/api/admin/agent-gateway/sessions?source=db&limit=20', true],
      ['/api/admin/agent-gateway/telemetry?hours=24&limit=200', true],
      ['/api/admin/jobs/metrics?hours=24', true],
    ]) {
      health[p[0]] = await postOrGet({
        adminToken,
        apiBaseUrl,
        csrfToken,
        pathName: p[0],
        timeoutMs: o.httpTimeoutMs,
        useAdmin: p[1],
      });
    }
    const rows = Array.isArray(health['/api/admin/jobs/metrics?hours=24'].json?.rows)
      ? health['/api/admin/jobs/metrics?hours=24'].json.rows
      : [];
    const names = new Set(rows.map((r) => r.job_name));
    const utcDateKey = new Date().toISOString().slice(0, 10);
    const cronByName = Object.fromEntries(rows.map((row) => [row.job_name, row]));
    const naturalCronRows = EXPECTED_CRON_JOBS.map((jobName) => {
      const row = cronByName[jobName] ?? {};
      const lastRunAt =
        typeof row.last_run_at === 'string' ? row.last_run_at : null;
      const lastStatus =
        typeof row.last_status === 'string'
          ? row.last_status.toLowerCase()
          : null;
      const ranToday =
        typeof lastRunAt === 'string' &&
        lastRunAt.length >= 10 &&
        lastRunAt.slice(0, 10) === utcDateKey;
      const passed = ranToday && lastStatus === 'success';
      return {
        jobName,
        lastRunAt,
        lastStatus,
        passed,
        ranToday,
      };
    });
    const naturalCronComplete = naturalCronRows.every((row) => row.passed);
    const healthSummary = {
      baseUrl: apiBaseUrl,
      checks: {
        health: health['/health'].status === 200 && health['/health'].json?.status === 'ok',
        ready:
          health['/ready'].status === 200 &&
          health['/ready'].json?.status === 'ok' &&
          health['/ready'].json?.db === 'ok' &&
          health['/ready'].json?.redis === 'ok',
        telemetryNonEmpty:
          Number(health['/api/admin/agent-gateway/telemetry?hours=24&limit=200'].json?.sessions?.total ?? 0) > 0 &&
          Number(health['/api/admin/agent-gateway/telemetry?hours=24&limit=200'].json?.events?.total ?? 0) > 0,
        sandboxExecutionMetricsReachable:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].status ===
            200 &&
          typeof health[
            '/api/admin/sandbox-execution/metrics?hours=24&limit=20'
          ].json?.summary === 'object',
        expectedCronJobsPresent: EXPECTED_CRON_JOBS.every((j) => names.has(j)),
        naturalCronWindow: o.requireNaturalCronWindow ? naturalCronComplete : true,
      },
      cron: {
        requireNaturalCronWindow: o.requireNaturalCronWindow,
        rows: naturalCronRows,
        utcDateKey,
      },
      generatedAtUtc: new Date().toISOString(),
    };
    healthSummary.pass = Object.values(healthSummary.checks).every(Boolean);
    await writeJson(path.resolve(ARTIFACTS.healthSummary), healthSummary);
    if (!healthSummary.pass) throw new Error('Launch health checkpoint failed');
    summary.checks.launchHealth = { pass: true, skipped: false };

    if (!o.skipRuntimeProbes) {
      const runtimeHealth = await postOrGet({
        adminToken,
        apiBaseUrl,
        csrfToken,
        pathName: '/api/admin/ai-runtime/health',
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const runtimeDryRun = await postOrGet({
        adminToken,
        apiBaseUrl,
        body: {
          role: 'critic',
          prompt: `production launch gate runtime dry run ${runtimeDraftId}`,
        },
        csrfToken,
        method: 'POST',
        pathName: '/api/admin/ai-runtime/dry-run',
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const buildRuntimeSandboxMetricsPath = (overrides = {}) => {
        const query = new URLSearchParams({
          hours: '24',
          limit: '20',
          mode: runtimeDryRunExpectedMode,
          operation: SANDBOX_RUNTIME_PROBE_OPERATION,
        });
        for (const [key, value] of Object.entries(overrides)) {
          if (typeof value === 'string' && value.length > 0) {
            query.set(key, value);
          }
        }
        return `/api/admin/sandbox-execution/metrics?${query.toString()}`;
      };
      const sandboxExecutionMetricsPath = buildRuntimeSandboxMetricsPath();
      const sandboxExecutionMetrics = await postOrGet({
        adminToken,
        apiBaseUrl,
        csrfToken,
        pathName: sandboxExecutionMetricsPath,
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const sandboxExecutionMetricsTotal =
        Number(sandboxExecutionMetrics.json?.summary?.total ?? 0) || 0;
      const sandboxExecutionMetricsSuccessCount =
        Number(sandboxExecutionMetrics.json?.summary?.successCount ?? 0) || 0;
      const sandboxExecutionMetricsFailedCount =
        Number(sandboxExecutionMetrics.json?.summary?.failedCount ?? 0) || 0;
      const sandboxExecutionModeConsistency =
        summarizeSandboxExecutionModeConsistency(
          sandboxExecutionMetrics.json?.modeBreakdown,
          runtimeDryRunExpectedMode,
        );
      const sandboxExecutionAuditTotalWithAudit =
        Number(sandboxExecutionMetrics.json?.auditCoverage?.totalWithAudit ?? 0) ||
        0;
      const sandboxExecutionAuditActorTypeCount =
        Number(sandboxExecutionMetrics.json?.auditCoverage?.actorTypeCount ?? 0) ||
        0;
      const sandboxExecutionAuditSourceRouteCount =
        Number(
          sandboxExecutionMetrics.json?.auditCoverage?.sourceRouteCount ?? 0,
        ) || 0;
      const sandboxExecutionAuditToolNameCount =
        Number(sandboxExecutionMetrics.json?.auditCoverage?.toolNameCount ?? 0) ||
        0;
      const sandboxExecutionAuditPolicy = {
        actorTypeCount: sandboxExecutionAuditActorTypeCount,
        pass:
          sandboxExecutionMetrics.ok &&
          sandboxExecutionMetricsTotal > 0 &&
          sandboxExecutionAuditTotalWithAudit > 0 &&
          sandboxExecutionAuditActorTypeCount > 0 &&
          sandboxExecutionAuditSourceRouteCount > 0 &&
          sandboxExecutionAuditToolNameCount > 0,
        requiredFields: SANDBOX_RUNTIME_REQUIRED_AUDIT_FIELDS,
        sourceRouteCount: sandboxExecutionAuditSourceRouteCount,
        status: sandboxExecutionMetrics.status,
        toolNameCount: sandboxExecutionAuditToolNameCount,
        total: sandboxExecutionMetricsTotal,
        totalWithAudit: sandboxExecutionAuditTotalWithAudit,
      };
      let sandboxExecutionEgressPolicy = {
        allowProbe: null,
        configSource: sandboxExecutionEgressConfig.source,
        decisionAllowProbe: null,
        decisionDenyProbe: null,
        denyProbe: null,
        enforcementEnabled: sandboxExecutionEgressEnforceConfig.value,
        enforcementSource: sandboxExecutionEgressEnforceConfig.source,
        expectedEgressProfile: runtimeDryRunEgressProfile,
        pass: true,
        reason:
          'No egress profile mapping configured for ai_runtime_dry_run (or wildcard fallback).',
        skipped: true,
      };
      let sandboxExecutionLimitsPolicy = {
        allowProbe: null,
        configSource: sandboxExecutionOperationLimitProfilesConfig.source,
        decisionAllowProbe: null,
        decisionDenyProbe: null,
        denyProbe: null,
        enforcementEnabled: sandboxExecutionLimitsEnforceConfig.value,
        enforcementSource: sandboxExecutionLimitsEnforceConfig.source,
        expectedLimitProfile: runtimeDryRunLimitProfile,
        pass: true,
        reason:
          'No limits profile mapping configured for ai_runtime_dry_run (or wildcard fallback).',
        skipped: true,
      };
      if (runtimeDryRunEgressProfile) {
        const deniedProfile = `probe_${crypto
          .randomUUID()
          .replace(/-/g, '')
          .slice(0, 24)}`;
        const allowProbeResponse = await postOrGet({
          adminToken,
          apiBaseUrl,
          csrfToken,
          pathName: buildRuntimeSandboxMetricsPath({
            egressProfile: runtimeDryRunEgressProfile,
          }),
          timeoutMs: o.httpTimeoutMs,
          useAdmin: true,
        });
        const denyProbeResponse = await postOrGet({
          adminToken,
          apiBaseUrl,
          csrfToken,
          pathName: buildRuntimeSandboxMetricsPath({
            egressProfile: deniedProfile,
          }),
          timeoutMs: o.httpTimeoutMs,
          useAdmin: true,
        });
        const allowDecisionProbeResponse =
          sandboxExecutionEgressEnforceConfig.value
            ? await postOrGet({
                adminToken,
                apiBaseUrl,
                csrfToken,
                pathName: buildRuntimeSandboxMetricsPath({
                  egressDecision: 'allow',
                  egressProfile: runtimeDryRunEgressProfile,
                }),
                timeoutMs: o.httpTimeoutMs,
                useAdmin: true,
              })
            : null;
        const denyDecisionProbeResponse =
          sandboxExecutionEgressEnforceConfig.value
            ? await postOrGet({
                adminToken,
                apiBaseUrl,
                csrfToken,
                pathName: buildRuntimeSandboxMetricsPath({
                  egressDecision: 'deny',
                  egressProfile: runtimeDryRunEgressProfile,
                }),
                timeoutMs: o.httpTimeoutMs,
                useAdmin: true,
              })
            : null;
        const allowTotal =
          Number(allowProbeResponse.json?.summary?.total ?? 0) || 0;
        const allowSuccessCount =
          Number(allowProbeResponse.json?.summary?.successCount ?? 0) || 0;
        const allowFailedCount =
          Number(allowProbeResponse.json?.summary?.failedCount ?? 0) || 0;
        const denyTotal = Number(denyProbeResponse.json?.summary?.total ?? 0) || 0;
        const denySuccessCount =
          Number(denyProbeResponse.json?.summary?.successCount ?? 0) || 0;
        const denyFailedCount =
          Number(denyProbeResponse.json?.summary?.failedCount ?? 0) || 0;
        const allowDecisionTotal =
          Number(allowDecisionProbeResponse?.json?.summary?.total ?? 0) || 0;
        const denyDecisionTotal =
          Number(denyDecisionProbeResponse?.json?.summary?.total ?? 0) || 0;
        sandboxExecutionEgressPolicy = {
          allowProbe: {
            failedCount: allowFailedCount,
            status: allowProbeResponse.status,
            successCount: allowSuccessCount,
            total: allowTotal,
          },
          configSource: sandboxExecutionEgressConfig.source,
          decisionAllowProbe:
            allowDecisionProbeResponse === null
              ? null
              : {
                  status: allowDecisionProbeResponse.status,
                  total: allowDecisionTotal,
                },
          decisionDenyProbe:
            denyDecisionProbeResponse === null
              ? null
              : {
                  status: denyDecisionProbeResponse.status,
                  total: denyDecisionTotal,
                },
          denyProbe: {
            failedCount: denyFailedCount,
            profile: deniedProfile,
            status: denyProbeResponse.status,
            successCount: denySuccessCount,
            total: denyTotal,
          },
          enforcementEnabled: sandboxExecutionEgressEnforceConfig.value,
          enforcementSource: sandboxExecutionEgressEnforceConfig.source,
          expectedEgressProfile: runtimeDryRunEgressProfile,
          pass:
            allowProbeResponse.ok &&
            allowTotal > 0 &&
            denyProbeResponse.ok &&
            denyTotal === 0 &&
            (!sandboxExecutionEgressEnforceConfig.value ||
              ((allowDecisionProbeResponse?.ok ?? false) &&
                allowDecisionTotal > 0 &&
                (denyDecisionProbeResponse?.ok ?? false) &&
                denyDecisionTotal === 0)),
          reason: null,
          skipped: false,
        };
      }
      if (runtimeDryRunLimitProfile) {
        const deniedProfile = `probe_${crypto
          .randomUUID()
          .replace(/-/g, '')
          .slice(0, 24)}`;
        const allowProbeResponse = await postOrGet({
          adminToken,
          apiBaseUrl,
          csrfToken,
          pathName: buildRuntimeSandboxMetricsPath({
            limitsProfile: runtimeDryRunLimitProfile,
          }),
          timeoutMs: o.httpTimeoutMs,
          useAdmin: true,
        });
        const denyProbeResponse = await postOrGet({
          adminToken,
          apiBaseUrl,
          csrfToken,
          pathName: buildRuntimeSandboxMetricsPath({
            limitsProfile: deniedProfile,
          }),
          timeoutMs: o.httpTimeoutMs,
          useAdmin: true,
        });
        const allowDecisionProbeResponse =
          sandboxExecutionLimitsEnforceConfig.value
            ? await postOrGet({
                adminToken,
                apiBaseUrl,
                csrfToken,
                pathName: buildRuntimeSandboxMetricsPath({
                  limitsDecision: 'allow',
                  limitsProfile: runtimeDryRunLimitProfile,
                }),
                timeoutMs: o.httpTimeoutMs,
                useAdmin: true,
              })
            : null;
        const denyDecisionProbeResponse =
          sandboxExecutionLimitsEnforceConfig.value
            ? await postOrGet({
                adminToken,
                apiBaseUrl,
                csrfToken,
                pathName: buildRuntimeSandboxMetricsPath({
                  limitsDecision: 'deny',
                  limitsProfile: runtimeDryRunLimitProfile,
                }),
                timeoutMs: o.httpTimeoutMs,
                useAdmin: true,
              })
            : null;
        const allowTotal =
          Number(allowProbeResponse.json?.summary?.total ?? 0) || 0;
        const allowSuccessCount =
          Number(allowProbeResponse.json?.summary?.successCount ?? 0) || 0;
        const allowFailedCount =
          Number(allowProbeResponse.json?.summary?.failedCount ?? 0) || 0;
        const denyTotal = Number(denyProbeResponse.json?.summary?.total ?? 0) || 0;
        const denySuccessCount =
          Number(denyProbeResponse.json?.summary?.successCount ?? 0) || 0;
        const denyFailedCount =
          Number(denyProbeResponse.json?.summary?.failedCount ?? 0) || 0;
        const allowDecisionTotal =
          Number(allowDecisionProbeResponse?.json?.summary?.total ?? 0) || 0;
        const denyDecisionTotal =
          Number(denyDecisionProbeResponse?.json?.summary?.total ?? 0) || 0;
        sandboxExecutionLimitsPolicy = {
          allowProbe: {
            failedCount: allowFailedCount,
            status: allowProbeResponse.status,
            successCount: allowSuccessCount,
            total: allowTotal,
          },
          configSource: sandboxExecutionOperationLimitProfilesConfig.source,
          decisionAllowProbe:
            allowDecisionProbeResponse === null
              ? null
              : {
                  status: allowDecisionProbeResponse.status,
                  total: allowDecisionTotal,
                },
          decisionDenyProbe:
            denyDecisionProbeResponse === null
              ? null
              : {
                  status: denyDecisionProbeResponse.status,
                  total: denyDecisionTotal,
                },
          denyProbe: {
            failedCount: denyFailedCount,
            profile: deniedProfile,
            status: denyProbeResponse.status,
            successCount: denySuccessCount,
            total: denyTotal,
          },
          enforcementEnabled: sandboxExecutionLimitsEnforceConfig.value,
          enforcementSource: sandboxExecutionLimitsEnforceConfig.source,
          expectedLimitProfile: runtimeDryRunLimitProfile,
          pass:
            allowProbeResponse.ok &&
            allowTotal > 0 &&
            denyProbeResponse.ok &&
            denyTotal === 0 &&
            (!sandboxExecutionLimitsEnforceConfig.value ||
              ((allowDecisionProbeResponse?.ok ?? false) &&
                allowDecisionTotal > 0 &&
                (denyDecisionProbeResponse?.ok ?? false) &&
                denyDecisionTotal === 0)),
          reason: null,
          skipped: false,
        };
      }
      const rt = await postOrGet({
        adminToken,
        apiBaseUrl,
        body: {
          draftId: runtimeDraftId,
          channel: o.runtimeChannel,
          externalSessionId: `launch-gate-runtime-${crypto.randomUUID()}`,
          promptSeed: 'production launch gate runtime probe',
        },
        csrfToken,
        method: 'POST',
        pathName: '/api/admin/agent-gateway/orchestrate',
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const stepPromptCoverage = buildStepPromptCoverage(rt.json?.steps);
      const runtimeMarkers = buildSkillMarkerCoverage(stepPromptCoverage);
      const rtArtifact = {
        baseUrl: apiBaseUrl,
        checkedAtUtc: new Date().toISOString(),
        draftId: runtimeDraftId,
        runtimeDryRun: {
          failed: runtimeDryRun.json?.result?.failed ?? null,
          ok: runtimeDryRun.ok,
          selectedProvider: runtimeDryRun.json?.result?.selectedProvider ?? null,
          status: runtimeDryRun.status,
        },
        sandboxExecutionMetrics: {
          expectedMode: runtimeDryRunExpectedMode,
          expectedModeSource: sandboxExecutionEnabledConfig.source,
          ok: sandboxExecutionMetrics.ok,
          status: sandboxExecutionMetrics.status,
          total: sandboxExecutionMetricsTotal,
          successCount: sandboxExecutionMetricsSuccessCount,
          failedCount: sandboxExecutionMetricsFailedCount,
          lastEventAt:
            sandboxExecutionMetrics.json?.summary?.lastEventAt ?? null,
        },
        modeConsistency: {
          ...sandboxExecutionModeConsistency,
          expectedModeSource: sandboxExecutionEnabledConfig.source,
        },
        auditPolicy: sandboxExecutionAuditPolicy,
        egressPolicy: sandboxExecutionEgressPolicy,
        limitsPolicy: sandboxExecutionLimitsPolicy,
        runtimeHealth: {
          health: runtimeHealth.json?.summary?.health ?? null,
          ok: runtimeHealth.ok,
          providersCoolingDown: runtimeHealth.json?.summary?.providersCoolingDown ?? null,
          rolesBlocked: runtimeHealth.json?.summary?.rolesBlocked ?? null,
          status: runtimeHealth.status,
        },
        orchestration: {
          completed: rt.json?.completed ?? null,
          ok: rt.ok,
          sessionId: rt.json?.sessionId ?? null,
          status: rt.status,
          stepRoles: Array.isArray(rt.json?.steps) ? rt.json.steps.map((s) => s.role) : [],
        },
        markers: {
          ...runtimeMarkers,
          stepCount: stepPromptCoverage.length,
          steps: stepPromptCoverage,
        },
      };
      rtArtifact.pass =
        rtArtifact.runtimeHealth.ok &&
        rtArtifact.runtimeHealth.health === 'ok' &&
        rtArtifact.runtimeDryRun.ok &&
        rtArtifact.runtimeDryRun.failed === false &&
        rtArtifact.sandboxExecutionMetrics.ok &&
        rtArtifact.sandboxExecutionMetrics.total > 0 &&
        rtArtifact.sandboxExecutionMetrics.successCount > 0 &&
        rtArtifact.modeConsistency.pass &&
        rtArtifact.auditPolicy.pass &&
        (rtArtifact.egressPolicy.skipped || rtArtifact.egressPolicy.pass) &&
        (rtArtifact.limitsPolicy.skipped || rtArtifact.limitsPolicy.pass) &&
        rtArtifact.orchestration.status === 201 &&
        rtArtifact.orchestration.completed === true &&
        rtArtifact.orchestration.stepRoles.join(',') === 'critic,maker,judge' &&
        (!o.requireSkillMarkers || runtimeMarkers.skillMarkerMultiStepPass);
      await writeJson(path.resolve(ARTIFACTS.runtimeProbe), rtArtifact);
      await writeJson(
        path.resolve(ARTIFACTS.sandboxExecutionMetrics),
        rtArtifact.sandboxExecutionMetrics,
      );
      await writeJson(
        path.resolve(ARTIFACTS.sandboxExecutionAuditPolicy),
        rtArtifact.auditPolicy,
      );
      await writeJson(
        path.resolve(ARTIFACTS.sandboxExecutionEgressPolicy),
        rtArtifact.egressPolicy,
      );
      await writeJson(
        path.resolve(ARTIFACTS.sandboxExecutionLimitsPolicy),
        rtArtifact.limitsPolicy,
      );
      summary.checks.runtimeProbe = { pass: rtArtifact.pass, skipped: false };
      summary.checks.sandboxExecutionMetrics = {
        pass:
          rtArtifact.sandboxExecutionMetrics.ok &&
          rtArtifact.sandboxExecutionMetrics.total > 0 &&
          rtArtifact.sandboxExecutionMetrics.successCount > 0,
        skipped: false,
      };
      summary.checks.sandboxExecutionModeConsistency = {
        pass: rtArtifact.modeConsistency.pass,
        skipped: false,
        expectedMode: rtArtifact.modeConsistency.expectedMode,
        expectedModeSource: rtArtifact.modeConsistency.expectedModeSource,
        expectedModeCount: rtArtifact.modeConsistency.expectedModeCount,
        otherModeCount: rtArtifact.modeConsistency.otherModeCount,
        total: rtArtifact.modeConsistency.total,
      };
      summary.checks.sandboxExecutionAuditPolicy = {
        pass: rtArtifact.auditPolicy.pass,
        skipped: false,
        requiredFields: rtArtifact.auditPolicy.requiredFields,
      };
      summary.checks.sandboxExecutionEgressPolicy = {
        pass: rtArtifact.egressPolicy.skipped || rtArtifact.egressPolicy.pass,
        skipped: rtArtifact.egressPolicy.skipped,
        configSource: rtArtifact.egressPolicy.configSource,
        enforcementEnabled: rtArtifact.egressPolicy.enforcementEnabled,
        enforcementSource: rtArtifact.egressPolicy.enforcementSource,
        expectedEgressProfile: rtArtifact.egressPolicy.expectedEgressProfile,
      };
      summary.checks.sandboxExecutionLimitsPolicy = {
        pass: rtArtifact.limitsPolicy.skipped || rtArtifact.limitsPolicy.pass,
        skipped: rtArtifact.limitsPolicy.skipped,
        configSource: rtArtifact.limitsPolicy.configSource,
        enforcementEnabled: rtArtifact.limitsPolicy.enforcementEnabled,
        enforcementSource: rtArtifact.limitsPolicy.enforcementSource,
        expectedLimitProfile: rtArtifact.limitsPolicy.expectedLimitProfile,
      };
      summary.checks.skillMarkerMultiStep = {
        pass: o.requireSkillMarkers ? runtimeMarkers.skillMarkerMultiStepPass : true,
        skipped: !o.requireSkillMarkers,
        missingRolePersonaRoles: runtimeMarkers.missingRolePersonaRoles,
        missingSkillCapsuleRoles: runtimeMarkers.missingSkillCapsuleRoles,
        roleSkillPresentRoles: runtimeMarkers.roleSkillPresentRoles,
      };
      if (!rtArtifact.pass) throw new Error('Runtime probe failed');

      const channels = ['web', 'live_session', o.runtimeChannel];
      const channelChecks = [];
      for (const channel of channels) {
        let m = null;
        let attempt = 0;
        while (attempt < 3) {
          attempt += 1;
          m = await postOrGet({
            adminToken,
            apiBaseUrl,
            body: {
              draftId: runtimeDraftId,
              channel,
              externalSessionId: `launch-gate-matrix-${channel}-${crypto.randomUUID()}`,
              promptSeed: `production launch gate matrix ${channel}`,
            },
            csrfToken,
            method: 'POST',
            pathName: '/api/admin/agent-gateway/orchestrate',
            timeoutMs: o.httpTimeoutMs,
            useAdmin: true,
          });
          if (m.status === 201) {
            break;
          }
          if (m.status < 500) {
            break;
          }
          await sleep(500);
        }
        const matrixStepPromptCoverage = buildStepPromptCoverage(m.json?.steps);
        const matrixMarkers = buildSkillMarkerCoverage(matrixStepPromptCoverage);
        channelChecks.push({
          attempts: attempt,
          channel,
          completed: m.json?.completed ?? null,
          error: m.ok ? null : m.json?.message || m.json?.error || m.text,
          markers: {
            ...matrixMarkers,
            stepCount: matrixStepPromptCoverage.length,
          },
          ok: m.ok,
          status: m.status,
          stepRoles: Array.isArray(m.json?.steps)
            ? m.json.steps.map((s) => s.role)
            : [],
        });
      }
      const matrixAdapters = await postOrGet({
        adminToken,
        apiBaseUrl,
        csrfToken,
        pathName: '/api/admin/agent-gateway/adapters?hours=24',
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const usage = Array.isArray(matrixAdapters.json?.adapters?.usage)
        ? matrixAdapters.json.adapters.usage
        : [];
      const usageMap = Object.fromEntries(usage.map((row) => [row.adapter, row]));
      const matrixArtifact = {
        adaptersSnapshot: {
          adaptersTotal: matrixAdapters.json?.adapters?.total ?? null,
          adaptersUsage: usage,
          status: matrixAdapters.status,
        },
        baseUrl: apiBaseUrl,
        channels: channelChecks,
        checkedAtUtc: new Date().toISOString(),
        draftId: runtimeDraftId,
      };
      const matrixChannelFlowPass = channelChecks.every(
        (row) =>
          row.status === 201 &&
          row.completed === true &&
          row.stepRoles.join(',') === 'critic,maker,judge',
      );
      const matrixAdapterUsagePass = ['web', 'live_session', 'external_webhook'].every(
        (adapter) => Number(usageMap?.[adapter]?.total ?? 0) > 0,
      );
      const matrixMarkerCoveragePass =
        !o.requireSkillMarkers ||
        channelChecks.every((row) => row.markers.skillMarkerMultiStepPass);
      const matrixMarkerFailedChannels = channelChecks
        .filter((row) => !row.markers.skillMarkerMultiStepPass)
        .map((row) => ({
          channel: row.channel,
          missingRolePersonaRoles: row.markers.missingRolePersonaRoles,
          missingSkillCapsuleRoles: row.markers.missingSkillCapsuleRoles,
          roleSkillPresentRoles: row.markers.roleSkillPresentRoles,
        }));
      matrixArtifact.markerCoverage = {
        failedChannels: matrixMarkerFailedChannels,
        pass: matrixMarkerCoveragePass,
        required: o.requireSkillMarkers,
      };
      matrixArtifact.pass =
        matrixChannelFlowPass && matrixAdapterUsagePass && matrixMarkerCoveragePass;
      await writeJson(path.resolve(ARTIFACTS.matrixProbe), matrixArtifact);
      const summaryMatrixFailedChannels = o.requireSkillMarkers
        ? matrixMarkerFailedChannels
        : [];
      summary.checks.skillMarkerMatrixChannels = {
        pass: o.requireSkillMarkers ? matrixMarkerCoveragePass : true,
        skipped: !o.requireSkillMarkers,
        failedChannels: summaryMatrixFailedChannels,
      };
      summary.checks.adapterMatrixProbe = {
        pass: matrixArtifact.pass,
        skipped: false,
        channelFlowPass: matrixChannelFlowPass,
        adapterUsagePass: matrixAdapterUsagePass,
        skillMarkerMatrixPass: matrixMarkerCoveragePass,
      };
      if (!matrixArtifact.pass) throw new Error('Adapter matrix probe failed');
    } else {
      summary.checks.runtimeProbe = { pass: true, skipped: true };
      summary.checks.sandboxExecutionMetrics = {
        pass: true,
        skipped: true,
      };
      summary.checks.sandboxExecutionModeConsistency = {
        pass: true,
        skipped: true,
      };
      summary.checks.sandboxExecutionAuditPolicy = {
        pass: true,
        skipped: true,
      };
      summary.checks.sandboxExecutionEgressPolicy = {
        pass: true,
        skipped: true,
      };
      summary.checks.sandboxExecutionLimitsPolicy = {
        pass: true,
        skipped: true,
      };
      summary.checks.skillMarkerMultiStep = {
        pass: true,
        skipped: true,
        missingRolePersonaRoles: [],
        missingSkillCapsuleRoles: [],
        roleSkillPresentRoles: [],
      };
      summary.checks.skillMarkerMatrixChannels = {
        pass: true,
        skipped: true,
        failedChannels: [],
      };
      summary.checks.adapterMatrixProbe = {
        pass: true,
        skipped: true,
      };
    }

    if (!o.skipIngestProbe) {
      const adaptersBeforeIngest = await postOrGet({
        adminToken,
        apiBaseUrl,
        csrfToken,
        pathName: '/api/admin/agent-gateway/adapters?hours=24',
        timeoutMs: o.httpTimeoutMs,
        useAdmin: true,
      });
      const configuredProfiles = Array.isArray(
        adaptersBeforeIngest.json?.connectorProfiles?.profiles,
      )
        ? adaptersBeforeIngest.json.connectorProfiles.profiles
        : [];
      const externalChannelProfiles = resolveExternalChannelProfiles(
        configuredProfiles,
      );
      const ts = Math.floor(Date.now() / 1000);
      const payload = {
        adapter: 'external_webhook',
        channel: 'launch_probe',
        connectorId: 'launch_probe',
        eventId: `launchprobe-${Date.now()}`,
        externalSessionId: `launch-gate-ingest-${crypto.randomUUID()}`,
        fromRole: 'author',
        toRole: 'critic',
        type: 'draft_cycle_started',
        payload: { draftId: runtimeDraftId, source: 'production-launch-gate' },
      };
      const canonical = JSON.stringify(sortDeep(payload));
      const sig = `v1=${crypto
        .createHmac('sha256', webhookSecret)
        .update(`${ts}.${canonical}`)
        .digest('hex')}`;
      const ingest = await postOrGet({
        apiBaseUrl,
        body: payload,
        csrfToken,
        headers: {
          'x-gateway-signature': sig,
          'x-gateway-timestamp': String(ts),
        },
        method: 'POST',
        pathName: '/api/agent-gateway/adapters/ingest',
        timeoutMs: o.httpTimeoutMs,
      });
      const channelFallbackChecks = [];
      if (externalChannelProfiles.length > 0) {
        for (const profile of externalChannelProfiles) {
          const channel = String(profile.channel || '').toLowerCase();
          const connectorId = String(profile.connectorId || '').toLowerCase();
          const suffix = Date.now().toString();
          const channelProbe = resolveExternalChannelProbePayload({
            channel,
            suffix,
          });
          const probePayload = {
            adapter: String(profile.adapter || 'external_webhook').toLowerCase(),
            channel,
            connectorId,
            eventId: `launchprobe-${channel}-${suffix}`,
            fromRole: String(profile.fromRole || 'observer').toLowerCase(),
            toRole: profile.toRole ? String(profile.toRole).toLowerCase() : null,
            type: String(profile.type || 'observer_message').toLowerCase(),
            payload: {
              ...channelProbe.payload,
              source: 'production-launch-gate-channel-fallback',
            },
          };
          const channelCanonical = JSON.stringify(sortDeep(probePayload));
          const channelSig = `v1=${crypto
            .createHmac('sha256', webhookSecret)
            .update(`${ts}.${channelCanonical}`)
            .digest('hex')}`;
          const channelIngest = await postOrGet({
            apiBaseUrl,
            body: probePayload,
            csrfToken,
            headers: {
              'x-gateway-signature': channelSig,
              'x-gateway-timestamp': String(ts),
            },
            method: 'POST',
            pathName: '/api/agent-gateway/adapters/ingest',
            timeoutMs: o.httpTimeoutMs,
          });
          const sessions = await postOrGet({
            adminToken,
            apiBaseUrl,
            csrfToken,
            method: 'GET',
            pathName: `/api/admin/agent-gateway/sessions?source=db&limit=50&channel=${encodeURIComponent(channel)}&connector=${encodeURIComponent(connectorId)}`,
            timeoutMs: o.httpTimeoutMs,
            useAdmin: true,
          });
          let connectorTelemetry = null;
          let connectorTelemetryAttempts = 0;
          let connectorTelemetryPass = false;
          while (connectorTelemetryAttempts < 3) {
            connectorTelemetryAttempts += 1;
            connectorTelemetry = await postOrGet({
              adminToken,
              apiBaseUrl,
              csrfToken,
              method: 'GET',
              pathName: `/api/admin/agent-gateway/telemetry?hours=24&limit=200&channel=${encodeURIComponent(channel)}&connector=${encodeURIComponent(connectorId)}`,
              timeoutMs: o.httpTimeoutMs,
              useAdmin: true,
            });
            const telemetryTotal = Number(
              connectorTelemetry.json?.ingestConnectors?.total ?? 0,
            );
            const telemetryAccepted = Number(
              connectorTelemetry.json?.ingestConnectors?.accepted ?? 0,
            );
            connectorTelemetryPass =
              connectorTelemetry.ok &&
              telemetryTotal > 0 &&
              telemetryAccepted > 0;
            if (connectorTelemetryPass) {
              break;
            }
            await sleep(500);
          }
          const sessionRows = Array.isArray(sessions.json?.sessions)
            ? sessions.json.sessions
            : [];
          const matchedSession = sessionRows.find(
            (row) => row?.id === channelIngest.json?.sessionId,
          );
          const pass =
            channelIngest.status === 201 &&
            channelIngest.json?.applied === true &&
            sessions.ok &&
            connectorTelemetryPass &&
            matchedSession?.externalSessionId ===
              channelProbe.expectedExternalSessionId;
          const check = {
            channel,
            connectorId,
            expectedExternalSessionId: channelProbe.expectedExternalSessionId,
            ingestStatus: channelIngest.status,
            ingestApplied: channelIngest.json?.applied ?? null,
            pass,
            resolvedExternalSessionId:
              matchedSession?.externalSessionId ?? null,
            sessionId: channelIngest.json?.sessionId ?? null,
            sessionsStatus: sessions.status,
            telemetryAccepted:
              Number(connectorTelemetry?.json?.ingestConnectors?.accepted ?? 0) ||
              0,
            telemetryAttempts: connectorTelemetryAttempts,
            telemetryPass: connectorTelemetryPass,
            telemetryRejected:
              Number(connectorTelemetry?.json?.ingestConnectors?.rejected ?? 0) ||
              0,
            telemetryStatus: connectorTelemetry?.status ?? null,
            telemetryTotal:
              Number(connectorTelemetry?.json?.ingestConnectors?.total ?? 0) || 0,
            trace: {
              probeEventId: probePayload.eventId,
              probeType: probePayload.type,
              source: probePayload.payload?.source ?? null,
            },
          };
          check.failureMode = classifyExternalChannelFallbackFailure(check);
          channelFallbackChecks.push(check);
        }
      }
      const externalChannelFallback =
        (() => {
          const configuredChannels = externalChannelProfiles.map((entry) =>
            String(entry.channel || '').toLowerCase(),
          );
          const requiredChannels = o.requiredExternalChannels;
          const missingRequiredChannels = requiredChannels.filter(
            (entry) => !configuredChannels.includes(entry),
          );
          const requiredChecks = channelFallbackChecks.filter((entry) =>
            requiredChannels.includes(entry.channel),
          );
          const failedChannels = channelFallbackChecks
            .filter((entry) => !entry.pass)
            .map((entry) => ({
              channel: entry.channel,
              connectorId: entry.connectorId,
              failureMode: entry.failureMode,
            }));
          const requiredFailedChannels = requiredChecks
            .filter((entry) => !entry.pass)
            .map((entry) => ({
              channel: entry.channel,
              connectorId: entry.connectorId,
              failureMode: entry.failureMode,
            }));
          const requiredChannelsPass =
            requiredChannels.length === 0
              ? true
              : missingRequiredChannels.length === 0 &&
                requiredChecks.length === requiredChannels.length &&
                requiredChecks.every((entry) => entry.pass);
          if (configuredChannels.length === 0 && requiredChannels.length === 0) {
            return {
              checks: [],
              configuredChannels: [],
              failedChannels: [],
              missingRequiredChannels: [],
              pass: true,
              reason:
                'No configured connector profiles for telegram/slack/discord.',
              requiredChannels: [],
              requiredFailedChannels: [],
              requiredChannelsPass: true,
              skipped: true,
            };
          }
          return {
            checks: channelFallbackChecks,
            configuredChannels,
            failedChannels,
            missingRequiredChannels,
            pass:
              requiredChannels.length > 0
                ? requiredChannelsPass
                : channelFallbackChecks.every((entry) => entry.pass),
            reason:
              missingRequiredChannels.length > 0
                ? `Missing required external channels: ${missingRequiredChannels.join(', ')}.`
                : null,
            requiredChannels,
            requiredFailedChannels,
            requiredChannelsPass,
            skipped: false,
          };
        })();
      const externalChannelTracesArtifact = {
        checkedAtUtc: new Date().toISOString(),
        configuredChannels: externalChannelFallback.configuredChannels,
        failedChannels: externalChannelFallback.failedChannels,
        missingRequiredChannels: externalChannelFallback.missingRequiredChannels,
        pass: externalChannelFallback.pass,
        requiredChannels: externalChannelFallback.requiredChannels,
        requiredFailedChannels: externalChannelFallback.requiredFailedChannels,
        requiredChannelsPass: externalChannelFallback.requiredChannelsPass,
        checks: channelFallbackChecks.map((entry) => ({
          channel: entry.channel,
          connectorId: entry.connectorId,
          pass: entry.pass,
          failureMode: entry.failureMode,
          trace: entry.trace,
          expectedExternalSessionId: entry.expectedExternalSessionId,
          resolvedExternalSessionId: entry.resolvedExternalSessionId,
          ingest: {
            status: entry.ingestStatus,
            applied: entry.ingestApplied,
            sessionId: entry.sessionId,
          },
          sessions: {
            status: entry.sessionsStatus,
          },
          telemetry: {
            status: entry.telemetryStatus,
            attempts: entry.telemetryAttempts,
            pass: entry.telemetryPass,
            total: entry.telemetryTotal,
            accepted: entry.telemetryAccepted,
            rejected: entry.telemetryRejected,
          },
        })),
        skipped: externalChannelFallback.skipped,
      };
      await writeJson(
        path.resolve(ARTIFACTS.externalChannelTraces),
        externalChannelTracesArtifact,
      );
      const ingestArtifact = {
        baseUrl: apiBaseUrl,
        checkedAtUtc: new Date().toISOString(),
        externalChannelFallback,
        ingest: { applied: ingest.json?.applied ?? null, status: ingest.status },
        pass:
          ingest.status === 201 &&
          ingest.json?.applied === true &&
          externalChannelFallback.pass,
      };
      await writeJson(path.resolve(ARTIFACTS.ingestProbe), ingestArtifact);
      summary.checks.ingestExternalChannelFallback = {
        pass: externalChannelFallback.pass,
        skipped: externalChannelFallback.skipped,
        configuredChannels: externalChannelFallback.configuredChannels,
        requiredChannels: externalChannelFallback.requiredChannels,
        missingRequiredChannels: externalChannelFallback.missingRequiredChannels,
        requiredChannelsPass: externalChannelFallback.requiredChannelsPass,
      };
      summary.checks.ingestExternalChannelFailureModes = {
        pass: externalChannelFallback.pass,
        skipped: externalChannelFallback.skipped,
        failedChannels: externalChannelFallback.failedChannels,
        requiredFailedChannels: externalChannelFallback.requiredFailedChannels,
      };
      summary.checks.ingestProbe = { pass: ingestArtifact.pass, skipped: false };
      if (!ingestArtifact.pass) throw new Error('Ingest probe failed');
    } else {
      summary.checks.ingestExternalChannelFallback = {
        pass: true,
        skipped: true,
        configuredChannels: [],
        requiredChannels: [],
        missingRequiredChannels: [],
        requiredChannelsPass: true,
      };
      summary.checks.ingestExternalChannelFailureModes = {
        pass: true,
        skipped: true,
        failedChannels: [],
        requiredFailedChannels: [],
      };
      await writeJson(path.resolve(ARTIFACTS.externalChannelTraces), {
        checkedAtUtc: new Date().toISOString(),
        configuredChannels: [],
        failedChannels: [],
        missingRequiredChannels: [],
        pass: true,
        requiredChannels: [],
        requiredFailedChannels: [],
        requiredChannelsPass: true,
        checks: [],
        skipped: true,
      });
      summary.checks.ingestProbe = { pass: true, skipped: true };
    }

    const telemetry = await postOrGet({
      adminToken,
      apiBaseUrl,
      csrfToken,
      pathName: '/api/admin/agent-gateway/telemetry?hours=24&limit=200',
      timeoutMs: o.httpTimeoutMs,
      useAdmin: true,
    });
    const adapters = await postOrGet({
      adminToken,
      apiBaseUrl,
      csrfToken,
      pathName: '/api/admin/agent-gateway/adapters?hours=24',
      timeoutMs: o.httpTimeoutMs,
      useAdmin: true,
    });
    await writeJson(path.resolve(ARTIFACTS.telemetry), telemetry.json ?? {});
    await writeJson(path.resolve(ARTIFACTS.adapters), adapters.json ?? {});
    const telemetryConnectorProfilesReady = hasConnectorProfilesSnapshot(
      telemetry.json?.connectorProfiles,
    );
    const adaptersConnectorProfilesReady = hasConnectorProfilesSnapshot(
      adapters.json?.connectorProfiles,
    );
    const connectorProfilesReady =
      telemetryConnectorProfilesReady && adaptersConnectorProfilesReady;
    await writeJson(path.resolve(ARTIFACTS.adminHealth), {
      timestampUtc: new Date().toISOString(),
      gateway: {
        adaptersTotal: adapters.json?.adapters?.total ?? null,
        adaptersConnectorProfilesTotal:
          adapters.json?.connectorProfiles?.total ?? null,
        telemetryConnectorProfilesTotal:
          telemetry.json?.connectorProfiles?.total ?? null,
        telemetryEventsTotal: telemetry.json?.events?.total ?? null,
        telemetrySessionsTotal: telemetry.json?.sessions?.total ?? null,
      },
      sandboxExecution: {
        egressConfigSource: sandboxExecutionEgressConfig.source,
        egressEnforcementEnabled: sandboxExecutionEgressEnforceConfig.value,
        egressEnforcementSource: sandboxExecutionEgressEnforceConfig.source,
        limitsConfigSource: sandboxExecutionOperationLimitProfilesConfig.source,
        limitsEnforcementEnabled: sandboxExecutionLimitsEnforceConfig.value,
        limitsEnforcementSource: sandboxExecutionLimitsEnforceConfig.source,
        runtimeDryRunExpectedMode,
        runtimeDryRunExpectedModeSource: sandboxExecutionEnabledConfig.source,
        failedCount:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.summary?.failedCount ?? null,
        runtimeDryRunEgressProfile: runtimeDryRunEgressProfile ?? null,
        runtimeDryRunLimitProfile: runtimeDryRunLimitProfile ?? null,
        status:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20']
            .status,
        successCount:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.summary?.successCount ?? null,
        total:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.summary?.total ?? null,
        auditTotalWithAudit:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.auditCoverage?.totalWithAudit ?? null,
        auditActorTypeCount:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.auditCoverage?.actorTypeCount ?? null,
        auditSourceRouteCount:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.auditCoverage?.sourceRouteCount ?? null,
        auditToolNameCount:
          health['/api/admin/sandbox-execution/metrics?hours=24&limit=20'].json
            ?.auditCoverage?.toolNameCount ?? null,
      },
      jobs: { expectedJobs: EXPECTED_CRON_JOBS, rows: rows.length },
    });
    summary.checks.snapshots = { pass: telemetry.ok && adapters.ok, skipped: false };
    summary.checks.connectorProfilesSnapshot = {
      pass: o.strict ? connectorProfilesReady : true,
      skipped: false,
      strictRequired: o.strict,
      telemetryReady: telemetryConnectorProfilesReady,
      adaptersReady: adaptersConnectorProfilesReady,
    };

    summary.pass = Object.values(summary.checks).every((c) => c.pass);
    summary.status = summary.pass ? 'pass' : 'fail';
  } catch (error) {
    summary.error = { message: error instanceof Error ? error.message : String(error) };
    summary.status = 'fail';
    summary.pass = false;
  }

  await writeJson(path.resolve(ARTIFACTS.summary), summary);
  if (o.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else {
    process.stdout.write(`Production launch gate: ${summary.status.toUpperCase()}\n`);
    if (!summary.pass) {
      const failureLines = buildProductionLaunchGateFailureLines({
        checks: summary.checks,
        error: summary.error,
        maxArrayItems: o.failureDetailMaxItems,
      });
      for (const line of failureLines) {
        process.stdout.write(`${line}\n`);
      }
    }
  }
  if (!summary.pass) process.exit(1);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
