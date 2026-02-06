import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_API_ROUTES = ['/health', '/ready'];
const DEFAULT_WEB_ROUTES = ['/', '/feed', '/search'];
const DEFAULT_ITERATIONS = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_API_THRESHOLD_MS = 800;
const DEFAULT_WEB_THRESHOLD_MS = 1800;
const DEFAULT_RESULTS_PATH = 'artifacts/perf/pre-release-results.json';
const DEFAULT_BASELINE_PATH = 'docs/ops/performance-baseline.json';

const parseNumber = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseRoutes = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const routes = raw
    .split(',')
    .map((route) => route.trim())
    .filter((route) => route.length > 0);
  return routes.length > 0 ? routes : fallback;
};

const formatRoute = (route) => {
  if (route.startsWith('/')) {
    return route;
  }
  return `/${route}`;
};

const percentile = (values, p) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[index];
};

const round = (value) => Number(value.toFixed(2));

const timedGet = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    const durationMs = performance.now() - startedAt;
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      error: null,
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      durationMs,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const measureEndpointSet = async ({
  label,
  baseUrl,
  routes,
  iterations,
  timeoutMs,
}) => {
  const results = [];
  for (const route of routes) {
    const endpoint = formatRoute(route);
    const url = new URL(endpoint, baseUrl).toString();
    const samples = [];
    const failures = [];

    for (let index = 0; index < iterations; index += 1) {
      const sample = await timedGet(url, timeoutMs);
      samples.push(round(sample.durationMs));
      if (!sample.ok) {
        failures.push({
          attempt: index + 1,
          status: sample.status,
          error: sample.error,
        });
      }
    }

    results.push({
      route: endpoint,
      url,
      samplesMs: samples,
      p95Ms: round(percentile(samples, 95)),
      avgMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
      maxMs: round(Math.max(...samples)),
      failures,
      allOk: failures.length === 0,
    });
  }

  const flattened = results.flatMap((entry) => entry.samplesMs);
  const failedRequests = results.flatMap((entry) => entry.failures).length;

  return {
    label,
    routes: results,
    requestCount: flattened.length,
    failedRequests,
    p95Ms: round(percentile(flattened, 95)),
    avgMs:
      flattened.length > 0
        ? round(flattened.reduce((sum, value) => sum + value, 0) / flattened.length)
        : 0,
  };
};

const loadBaseline = async (baselinePath) => {
  try {
    const raw = await readFile(baselinePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      apiP95Ms: parseNumber(parsed.apiP95Ms, DEFAULT_API_THRESHOLD_MS),
      webP95Ms: parseNumber(parsed.webP95Ms, DEFAULT_WEB_THRESHOLD_MS),
      maxRegressionPercent: parseNumber(parsed.maxRegressionPercent, 20),
      sourcePath: baselinePath,
    };
  } catch {
    return {
      apiP95Ms: DEFAULT_API_THRESHOLD_MS,
      webP95Ms: DEFAULT_WEB_THRESHOLD_MS,
      maxRegressionPercent: 20,
      sourcePath: null,
    };
  }
};

const evaluateRegression = ({ current, baseline, maxRegressionPercent }) => {
  const allowed = baseline * (1 + maxRegressionPercent / 100);
  return {
    baselineMs: baseline,
    allowedMs: round(allowed),
    currentMs: current,
    withinBudget: current <= allowed,
    regressionPercent: round(((current - baseline) / baseline) * 100),
  };
};

const main = async () => {
  const apiBaseUrl = process.env.PERF_API_BASE_URL;
  const webBaseUrl = process.env.PERF_WEB_BASE_URL;
  if (!apiBaseUrl || !webBaseUrl) {
    throw new Error(
      'PERF_API_BASE_URL and PERF_WEB_BASE_URL are required for pre-release performance checks.',
    );
  }

  const apiRoutes = parseRoutes(process.env.PERF_API_ROUTES, DEFAULT_API_ROUTES);
  const webRoutes = parseRoutes(process.env.PERF_WEB_ROUTES, DEFAULT_WEB_ROUTES);
  const iterations = parseNumber(process.env.PERF_ITERATIONS, DEFAULT_ITERATIONS);
  const timeoutMs = parseNumber(process.env.PERF_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const resultsPath = process.env.PERF_RESULTS_PATH ?? DEFAULT_RESULTS_PATH;
  const baselinePath = process.env.PERF_BASELINE_PATH ?? DEFAULT_BASELINE_PATH;

  const baseline = await loadBaseline(baselinePath);

  const [apiResults, webResults] = await Promise.all([
    measureEndpointSet({
      label: 'api',
      baseUrl: apiBaseUrl,
      routes: apiRoutes,
      iterations,
      timeoutMs,
    }),
    measureEndpointSet({
      label: 'web',
      baseUrl: webBaseUrl,
      routes: webRoutes,
      iterations,
      timeoutMs,
    }),
  ]);

  const apiRegression = evaluateRegression({
    current: apiResults.p95Ms,
    baseline: baseline.apiP95Ms,
    maxRegressionPercent: baseline.maxRegressionPercent,
  });
  const webRegression = evaluateRegression({
    current: webResults.p95Ms,
    baseline: baseline.webP95Ms,
    maxRegressionPercent: baseline.maxRegressionPercent,
  });

  const hasApiFailures = apiResults.failedRequests > 0;
  const hasWebFailures = webResults.failedRequests > 0;
  const pass =
    !hasApiFailures &&
    !hasWebFailures &&
    apiRegression.withinBudget &&
    webRegression.withinBudget;

  const report = {
    generatedAtUtc: new Date().toISOString(),
    config: {
      apiBaseUrl,
      webBaseUrl,
      apiRoutes: apiRoutes.map((route) => formatRoute(route)),
      webRoutes: webRoutes.map((route) => formatRoute(route)),
      iterations,
      timeoutMs,
      baseline,
    },
    summary: {
      pass,
      api: {
        p95Ms: apiResults.p95Ms,
        avgMs: apiResults.avgMs,
        failedRequests: apiResults.failedRequests,
        regression: apiRegression,
      },
      web: {
        p95Ms: webResults.p95Ms,
        avgMs: webResults.avgMs,
        failedRequests: webResults.failedRequests,
        regression: webRegression,
      },
    },
    details: {
      api: apiResults.routes,
      web: webResults.routes,
    },
  };

  const resolvedPath = path.resolve(resultsPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(report, null, 2));

  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  process.stdout.write(`Performance report written to ${resolvedPath}\n`);

  if (!pass) {
    throw new Error(
      'Pre-release performance gate failed. Check report for failed requests or budget regressions.',
    );
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
