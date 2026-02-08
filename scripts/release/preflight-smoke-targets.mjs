import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH,
  RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_SUCCESS_STREAK = 2;
const DEFAULT_OUTPUT_PATH = 'artifacts/release/tunnel-preflight-summary.json';
const DEFAULT_ALLOW_SKIP = false;
const HOME_MARKER = 'Watch AI studios';
const PREFLIGHT_LABEL = 'release:smoke:preflight';

const parseNumber = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseInteger = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArguments = (argv) => {
  const options = {
    allowSkip: DEFAULT_ALLOW_SKIP,
  };

  for (const arg of argv) {
    if (arg === '--allow-skip') {
      options.allowSkip = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node scripts/release/preflight-smoke-targets.mjs [--allow-skip]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const buildUrl = (baseUrl, route) => {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return new URL(normalizedRoute, baseUrl).toString();
};

const toUtc = (epochMs) => new Date(epochMs).toISOString();
const createBaseSummaryFields = () => ({
  schemaPath: RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH,
  schemaVersion: RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_VERSION,
  label: PREFLIGHT_LABEL,
});

const probeApiHealth = async (apiBaseUrl) => {
  const url = buildUrl(apiBaseUrl, '/health');
  try {
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    if (response.status === 200 && payload?.status === 'ok') {
      return { pass: true, status: response.status, reason: 'ok' };
    }
    return {
      pass: false,
      status: response.status,
      reason: `expected 200 + {status:'ok'}, received status ${response.status}`,
    };
  } catch (error) {
    return {
      pass: false,
      status: null,
      reason: `network error: ${String(error)}`,
    };
  }
};

const probeWebHome = async (webBaseUrl) => {
  const url = buildUrl(webBaseUrl, '/');
  try {
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    if (response.status === 200 && text.includes(HOME_MARKER)) {
      return { pass: true, status: response.status, reason: 'ok' };
    }

    return {
      pass: false,
      status: response.status,
      reason: `expected 200 + home marker, received status ${response.status}`,
    };
  } catch (error) {
    return {
      pass: false,
      status: null,
      reason: `network error: ${String(error)}`,
    };
  }
};

const writeSummary = async ({ summary, outputPath }) => {
  const resolvedPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(summary, null, 2), 'utf8');
  process.stdout.write(`Release smoke preflight summary written to ${resolvedPath}\n`);
};

const createSkippedSummary = ({ apiBaseUrl, webBaseUrl, timeoutMs, intervalMs, successStreak }) => {
  const now = Date.now();
  const missing = [];
  if (!apiBaseUrl) {
    missing.push('apiBaseUrl');
  }
  if (!webBaseUrl) {
    missing.push('webBaseUrl');
  }

  return {
    ...createBaseSummaryFields(),
    status: 'skipped',
    mode: 'fallback-local-stack',
    reason: `Missing URL inputs: ${missing.join(', ')}`,
    startedAtUtc: toUtc(now),
    completedAtUtc: toUtc(now),
    durationMs: 0,
    attempts: 0,
    timeoutMs,
    intervalMs,
    requiredSuccessStreak: successStreak,
    api: {
      baseUrl: apiBaseUrl || null,
    },
    web: {
      baseUrl: webBaseUrl || null,
    },
  };
};

const runPreflight = async ({
  apiBaseUrl,
  webBaseUrl,
  timeoutMs,
  intervalMs,
  successStreak,
}) => {
  const startedAtMs = Date.now();
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let apiStreak = 0;
  let webStreak = 0;
  let lastApiProbe = null;
  let lastWebProbe = null;
  let apiFirstSuccessAttempt = null;
  let webFirstSuccessAttempt = null;
  let apiFirstSuccessLatencyMs = null;
  let webFirstSuccessLatencyMs = null;

  while (Date.now() < deadline) {
    attempts += 1;
    const [apiProbe, webProbe] = await Promise.all([
      probeApiHealth(apiBaseUrl),
      probeWebHome(webBaseUrl),
    ]);

    lastApiProbe = apiProbe;
    lastWebProbe = webProbe;

    if (apiProbe.pass && apiFirstSuccessAttempt === null) {
      apiFirstSuccessAttempt = attempts;
      apiFirstSuccessLatencyMs = Date.now() - startedAtMs;
    }
    if (webProbe.pass && webFirstSuccessAttempt === null) {
      webFirstSuccessAttempt = attempts;
      webFirstSuccessLatencyMs = Date.now() - startedAtMs;
    }

    apiStreak = apiProbe.pass ? apiStreak + 1 : 0;
    webStreak = webProbe.pass ? webStreak + 1 : 0;

    if (apiStreak >= successStreak && webStreak >= successStreak) {
      const completedAtMs = Date.now();
      return {
        ...createBaseSummaryFields(),
        status: 'pass',
        mode: 'url-input',
        startedAtUtc: toUtc(startedAtMs),
        completedAtUtc: toUtc(completedAtMs),
        durationMs: completedAtMs - startedAtMs,
        attempts,
        timeoutMs,
        intervalMs,
        requiredSuccessStreak: successStreak,
        api: {
          baseUrl: apiBaseUrl,
          firstSuccessAttempt: apiFirstSuccessAttempt,
          firstSuccessLatencyMs: apiFirstSuccessLatencyMs,
          finalSuccessStreak: apiStreak,
          lastStatus: apiProbe.status,
          lastReason: apiProbe.reason,
        },
        web: {
          baseUrl: webBaseUrl,
          firstSuccessAttempt: webFirstSuccessAttempt,
          firstSuccessLatencyMs: webFirstSuccessLatencyMs,
          finalSuccessStreak: webStreak,
          lastStatus: webProbe.status,
          lastReason: webProbe.reason,
        },
      };
    }

    await sleep(intervalMs);
  }

  const completedAtMs = Date.now();
  const summary = {
    ...createBaseSummaryFields(),
    status: 'fail',
    mode: 'url-input',
    startedAtUtc: toUtc(startedAtMs),
    completedAtUtc: toUtc(completedAtMs),
    durationMs: completedAtMs - startedAtMs,
    attempts,
    timeoutMs,
    intervalMs,
    requiredSuccessStreak: successStreak,
    api: {
      baseUrl: apiBaseUrl,
      firstSuccessAttempt: apiFirstSuccessAttempt,
      firstSuccessLatencyMs: apiFirstSuccessLatencyMs,
      finalSuccessStreak: apiStreak,
      lastStatus: lastApiProbe?.status ?? null,
      lastReason: lastApiProbe?.reason ?? 'no probe result',
    },
    web: {
      baseUrl: webBaseUrl,
      firstSuccessAttempt: webFirstSuccessAttempt,
      firstSuccessLatencyMs: webFirstSuccessLatencyMs,
      finalSuccessStreak: webStreak,
      lastStatus: lastWebProbe?.status ?? null,
      lastReason: lastWebProbe?.reason ?? 'no probe result',
    },
  };

  const error = new Error(
    `Release smoke preflight failed after ${timeoutMs}ms. Last API probe: status=${summary.api.lastStatus ?? 'n/a'}, reason=${summary.api.lastReason}. Last WEB probe: status=${summary.web.lastStatus ?? 'n/a'}, reason=${summary.web.lastReason}.`,
  );
  Object.assign(error, {
    preflightSummary: summary,
  });
  throw error;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const apiBaseUrl = process.env.RELEASE_PREFLIGHT_API_BASE_URL?.trim() ?? '';
  const webBaseUrl = process.env.RELEASE_PREFLIGHT_WEB_BASE_URL?.trim() ?? '';
  const timeoutMs = parseNumber(
    process.env.RELEASE_PREFLIGHT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const intervalMs = parseNumber(
    process.env.RELEASE_PREFLIGHT_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  const successStreak = parseInteger(
    process.env.RELEASE_PREFLIGHT_SUCCESS_STREAK,
    DEFAULT_SUCCESS_STREAK,
  );
  const outputPath =
    process.env.RELEASE_PREFLIGHT_OUTPUT_PATH?.trim() ?? DEFAULT_OUTPUT_PATH;

  if (!apiBaseUrl || !webBaseUrl) {
    if (!options.allowSkip) {
      throw new Error(
        'Missing required URL inputs. Set RELEASE_PREFLIGHT_API_BASE_URL and RELEASE_PREFLIGHT_WEB_BASE_URL, or pass --allow-skip.',
      );
    }
    const summary = createSkippedSummary({
      apiBaseUrl,
      webBaseUrl,
      timeoutMs,
      intervalMs,
      successStreak,
    });
    await writeSummary({
      summary,
      outputPath,
    });
    process.stdout.write(`Release smoke preflight skipped: ${summary.reason}\n`);
    return;
  }

  try {
    const summary = await runPreflight({
      apiBaseUrl,
      webBaseUrl,
      timeoutMs,
      intervalMs,
      successStreak,
    });
    await writeSummary({
      summary,
      outputPath,
    });
    process.stdout.write(
      `Release smoke preflight passed (attempts: ${summary.attempts}, duration: ${summary.durationMs}ms).\n`,
    );
  } catch (error) {
    const summary = error?.preflightSummary ?? null;
    if (summary) {
      await writeSummary({
        summary,
        outputPath,
      });
    }
    throw error;
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
