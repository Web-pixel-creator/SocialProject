import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4000';
const DEFAULT_WEB_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_RESULTS_PATH = 'artifacts/release/smoke-results.json';
const DEFAULT_TIMEOUT_MS = 10_000;
const SENSITIVE_FIELD_PATTERNS = [
  'token',
  'apiKey',
  'apikey',
  'secret',
  'password',
  'authorization',
];

const parseNumber = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const round = (value) => Number(value.toFixed(2));

const buildUrl = (baseUrl, route) => {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return new URL(normalized, baseUrl).toString();
};

const timedRequest = async ({ url, method, timeoutMs, headers, body }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    let json = null;
    if (contentType.includes('application/json')) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      text,
      json,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      durationMs: performance.now() - startedAt,
      text: '',
      json: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isSensitiveField = (fieldName) => {
  const normalized = fieldName.toLowerCase();
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  return false;
};

const sanitizeForReport = (value, fieldName = '') => {
  if (isSensitiveField(fieldName)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForReport(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sanitizeForReport(child, key),
      ]),
    );
  }

  if (typeof value === 'string') {
    const jwtPattern =
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
    if (jwtPattern.test(value)) {
      return '[REDACTED]';
    }
  }

  return value;
};

const main = async () => {
  const apiBaseUrl = process.env.RELEASE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const webBaseUrl = process.env.RELEASE_WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL;
  const timeoutMs = parseNumber(
    process.env.RELEASE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const resultsPath = process.env.RELEASE_RESULTS_PATH ?? DEFAULT_RESULTS_PATH;
  const csrfToken = process.env.RELEASE_CSRF_TOKEN ?? '';
  const runId = randomUUID();

  const report = {
    generatedAtUtc: new Date().toISOString(),
    config: {
      apiBaseUrl,
      webBaseUrl,
      timeoutMs,
      csrfTokenConfigured: csrfToken.length > 0,
    },
    summary: {
      pass: false,
      totalSteps: 0,
      failedSteps: 0,
    },
    context: {
      runId,
      humanEmail: '',
      humanUserId: null,
      authorAgentId: null,
      makerAgentId: null,
      draftId: null,
      pullRequestId: null,
    },
    steps: [],
  };

  const addStep = (step) => {
    report.steps.push(step);
  };

  const evaluateStep = async ({
    name,
    method,
    url,
    headers,
    bodyObject,
    validate,
  }) => {
    const body = bodyObject ? JSON.stringify(bodyObject) : undefined;
    const requestHeaders = { ...(headers ?? {}) };
    if (body) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const response = await timedRequest({
      url,
      method,
      timeoutMs,
      headers: requestHeaders,
      body,
    });

    let pass = false;
    let validationError = null;
    try {
      pass = validate(response);
      if (!pass) {
        validationError = 'Validation returned false';
      }
    } catch (error) {
      pass = false;
      validationError = toErrorMessage(error);
    }

    const safeJson = sanitizeForReport(response.json);
    const snippetSource = safeJson ?? response.text;
    const snippet =
      typeof snippetSource === 'string'
        ? snippetSource.slice(0, 220)
        : JSON.stringify(snippetSource).slice(0, 220);

    addStep({
      name,
      method,
      url,
      pass,
      status: response.status,
      durationMs: round(response.durationMs),
      error: response.error ?? validationError,
      responseSnippet: snippet,
    });

    if (!pass) {
      throw new Error(
        `${name} failed (status: ${response.status ?? 'n/a'}). ${
          response.error ?? validationError ?? 'Unknown error'
        }`,
      );
    }

    return response;
  };

  const withCsrf = (headers) => {
    if (!csrfToken) {
      return headers;
    }
    return { ...headers, 'x-csrf-token': csrfToken };
  };

  try {
    const healthRes = await evaluateStep({
      name: 'api.health',
      method: 'GET',
      url: buildUrl(apiBaseUrl, '/health'),
      validate: (response) =>
        response.status === 200 && response.json?.status === 'ok',
    });
    void healthRes;

    const readyRes = await evaluateStep({
      name: 'api.ready',
      method: 'GET',
      url: buildUrl(apiBaseUrl, '/ready'),
      validate: (response) =>
        response.status === 200 &&
        response.json?.status === 'ok' &&
        response.json?.db === 'ok' &&
        response.json?.redis === 'ok',
    });
    void readyRes;

    const humanEmail = `smoke+${runId.slice(0, 8)}@finishit.local`;
    const humanPassword = `Smoke-${runId.slice(0, 8)}-Pass!`;
    report.context.humanEmail = humanEmail;

    const registerHumanRes = await evaluateStep({
      name: 'api.auth.register',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/auth/register'),
      headers: withCsrf({}),
      bodyObject: {
        email: humanEmail,
        password: humanPassword,
        consent: {
          termsAccepted: true,
          privacyAccepted: true,
        },
      },
      validate: (response) =>
        response.status === 200 &&
        typeof response.json?.userId === 'string' &&
        typeof response.json?.tokens?.accessToken === 'string',
    });
    report.context.humanUserId = registerHumanRes.json.userId;

    const loginHumanRes = await evaluateStep({
      name: 'api.auth.login',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/auth/login'),
      headers: withCsrf({}),
      bodyObject: {
        email: humanEmail,
        password: humanPassword,
      },
      validate: (response) =>
        response.status === 200 &&
        typeof response.json?.userId === 'string' &&
        typeof response.json?.tokens?.accessToken === 'string',
    });
    void loginHumanRes;

    const registerAuthorRes = await evaluateStep({
      name: 'api.agent.register.author',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/agents/register'),
      headers: withCsrf({}),
      bodyObject: {
        studioName: `Smoke Author ${runId.slice(0, 6)}`,
        personality: 'release-dry-run-author',
      },
      validate: (response) =>
        response.status === 200 &&
        typeof response.json?.agentId === 'string' &&
        typeof response.json?.apiKey === 'string' &&
        typeof response.json?.claimToken === 'string' &&
        typeof response.json?.emailToken === 'string',
    });
    const authorAgent = registerAuthorRes.json;
    report.context.authorAgentId = authorAgent.agentId;

    const verifyAuthorRes = await evaluateStep({
      name: 'api.agent.verify.author',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/agents/claim/verify'),
      headers: withCsrf({}),
      bodyObject: {
        claimToken: authorAgent.claimToken,
        method: 'email',
        emailToken: authorAgent.emailToken,
      },
      validate: (response) =>
        response.status === 200 && Number(response.json?.trustTier ?? 0) >= 1,
    });
    void verifyAuthorRes;

    const registerMakerRes = await evaluateStep({
      name: 'api.agent.register.maker',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/agents/register'),
      headers: withCsrf({}),
      bodyObject: {
        studioName: `Smoke Maker ${runId.slice(0, 6)}`,
        personality: 'release-dry-run-maker',
      },
      validate: (response) =>
        response.status === 200 &&
        typeof response.json?.agentId === 'string' &&
        typeof response.json?.apiKey === 'string' &&
        typeof response.json?.claimToken === 'string' &&
        typeof response.json?.emailToken === 'string',
    });
    const makerAgent = registerMakerRes.json;
    report.context.makerAgentId = makerAgent.agentId;

    const verifyMakerRes = await evaluateStep({
      name: 'api.agent.verify.maker',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/agents/claim/verify'),
      headers: withCsrf({}),
      bodyObject: {
        claimToken: makerAgent.claimToken,
        method: 'email',
        emailToken: makerAgent.emailToken,
      },
      validate: (response) =>
        response.status === 200 && Number(response.json?.trustTier ?? 0) >= 1,
    });
    void verifyMakerRes;

    const authorHeaders = withCsrf({
      'x-agent-id': authorAgent.agentId,
      'x-api-key': authorAgent.apiKey,
    });
    const makerHeaders = withCsrf({
      'x-agent-id': makerAgent.agentId,
      'x-api-key': makerAgent.apiKey,
    });

    const createDraftRes = await evaluateStep({
      name: 'api.draft.create',
      method: 'POST',
      url: buildUrl(apiBaseUrl, '/api/drafts'),
      headers: authorHeaders,
      bodyObject: {
        imageUrl: 'https://example.com/smoke-before.png',
        thumbnailUrl: 'https://example.com/smoke-before-thumb.png',
        metadata: {
          title: `Smoke Draft ${runId.slice(0, 8)}`,
          tags: ['smoke', 'release'],
        },
      },
      validate: (response) =>
        response.status === 200 && typeof response.json?.draft?.id === 'string',
    });
    const draftId = createDraftRes.json.draft.id;
    report.context.draftId = draftId;

    const getDraftRes = await evaluateStep({
      name: 'api.draft.get',
      method: 'GET',
      url: buildUrl(apiBaseUrl, `/api/drafts/${draftId}`),
      validate: (response) =>
        response.status === 200 && response.json?.draft?.id === draftId,
    });
    void getDraftRes;

    const listDraftRes = await evaluateStep({
      name: 'api.draft.list',
      method: 'GET',
      url: buildUrl(apiBaseUrl, `/api/drafts?authorId=${authorAgent.agentId}`),
      validate: (response) =>
        response.status === 200 &&
        Array.isArray(response.json) &&
        response.json.some((item) => item.id === draftId),
    });
    void listDraftRes;

    const submitPrRes = await evaluateStep({
      name: 'api.pr.submit',
      method: 'POST',
      url: buildUrl(apiBaseUrl, `/api/drafts/${draftId}/pull-requests`),
      headers: makerHeaders,
      bodyObject: {
        description: 'Smoke PR from automated dry-run',
        severity: 'minor',
        addressedFixRequests: [],
        imageUrl: 'https://example.com/smoke-after.png',
        thumbnailUrl: 'https://example.com/smoke-after-thumb.png',
      },
      validate: (response) =>
        response.status === 200 && typeof response.json?.id === 'string',
    });
    const pullRequestId = submitPrRes.json.id;
    report.context.pullRequestId = pullRequestId;

    const decidePrRes = await evaluateStep({
      name: 'api.pr.decide',
      method: 'POST',
      url: buildUrl(apiBaseUrl, `/api/pull-requests/${pullRequestId}/decide`),
      headers: authorHeaders,
      bodyObject: {
        decision: 'reject',
        rejectionReason: 'Smoke dry-run validation',
      },
      validate: (response) =>
        response.status === 200 && response.json?.id === pullRequestId,
    });
    void decidePrRes;

    const searchRes = await evaluateStep({
      name: 'api.search',
      method: 'GET',
      url: buildUrl(apiBaseUrl, '/api/search?q=smoke&type=all&sort=recency'),
      validate: (response) =>
        response.status === 200 && Array.isArray(response.json),
    });
    void searchRes;

    const feedRes = await evaluateStep({
      name: 'api.feed',
      method: 'GET',
      url: buildUrl(apiBaseUrl, '/api/feed?limit=10&sort=recent'),
      validate: (response) =>
        response.status === 200 && Array.isArray(response.json),
    });
    void feedRes;

    const homePageRes = await evaluateStep({
      name: 'web.home',
      method: 'GET',
      url: buildUrl(webBaseUrl, '/'),
      validate: (response) =>
        response.status === 200 && response.text.includes('Watch AI studios'),
    });
    void homePageRes;

    const feedPageRes = await evaluateStep({
      name: 'web.feed',
      method: 'GET',
      url: buildUrl(webBaseUrl, '/feed'),
      validate: (response) =>
        response.status === 200 && response.text.includes('Feeds'),
    });
    void feedPageRes;

    const searchPageRes = await evaluateStep({
      name: 'web.search',
      method: 'GET',
      url: buildUrl(webBaseUrl, '/search'),
      validate: (response) =>
        response.status === 200 && response.text.includes('Search'),
    });
    void searchPageRes;

    const draftPageRes = await evaluateStep({
      name: 'web.draft.detail',
      method: 'GET',
      url: buildUrl(webBaseUrl, `/drafts/${draftId}`),
      validate: (response) => response.status === 200,
    });
    void draftPageRes;
  } catch (error) {
    report.summary.error = toErrorMessage(error);
  }

  report.summary.totalSteps = report.steps.length;
  report.summary.failedSteps = report.steps.filter((step) => !step.pass).length;
  report.summary.pass = report.summary.failedSteps === 0;

  const resolvedPath = path.resolve(resultsPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(report, null, 2));

  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  process.stdout.write(`Smoke report written to ${resolvedPath}\n`);

  if (!report.summary.pass) {
    throw new Error(
      'Release smoke check failed. See artifacts/release/smoke-results.json for details.',
    );
  }
};

main().catch((error) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exit(1);
});
