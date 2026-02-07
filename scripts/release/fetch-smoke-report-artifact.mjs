import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_ARTIFACT_NAME = 'release-smoke-report';
const DEFAULT_OUTPUT_DIR = 'artifacts/release';
const DEFAULT_WORKFLOW_FILE = 'ci.yml';
const DEFAULT_EXTRACT_ENABLED = true;

const readOriginRemote = () => {
  const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8',
  }).trim();
  if (!remote) {
    throw new Error('Git remote origin is not configured.');
  }
  return remote;
};

const parseRepoSlugFromRemote = (remote) => {
  const httpsMatch = remote.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u,
  );
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = remote.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  throw new Error(
    `Unsupported remote URL format: ${remote}. Expected GitHub https/ssh remote.`,
  );
};

const resolveRepoSlug = () => {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return parseRepoSlugFromRemote(readOriginRemote());
};

const readTokenFromGitCredentialStore = () => {
  const output = execFileSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n',
  });

  const tokenLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith('password='));
  if (!tokenLine) {
    throw new Error(
      'Unable to resolve GitHub token from credential store. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }

  const token = tokenLine.slice('password='.length).trim();
  if (!token) {
    throw new Error(
      'Git credential store returned empty password. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }

  return token;
};

const resolveToken = () => {
  const fromEnv = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readTokenFromGitCredentialStore();
};

const parseBoolean = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const githubRequest = async ({
  token,
  method,
  url,
  body,
  expectBinary = false,
}) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.ok) {
    if (expectBinary) {
      return Buffer.from(await response.arrayBuffer());
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const errorText = await response.text();
  let details = errorText;
  try {
    const json = JSON.parse(errorText);
    details = json.message ? `${json.message}` : errorText;
  } catch {
    // keep raw response text
  }

  throw new Error(
    `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}. ${details}`,
  );
};

const parseRunId = (raw) => {
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid run id '${raw}'. Use a positive integer.`);
  }
  return parsed;
};

const findLatestDispatchRunId = async ({ token, baseApiUrl, workflowFile }) => {
  const url = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/runs?event=workflow_dispatch&status=completed&per_page=20`;
  const data = await githubRequest({
    token,
    method: 'GET',
    url,
  });
  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  const run = runs.find((entry) => entry?.conclusion === 'success');
  if (!run?.id) {
    throw new Error(
      'Unable to discover a successful workflow_dispatch run. Provide run id explicitly.',
    );
  }
  return {
    id: run.id,
    runNumber: run.run_number,
    htmlUrl: run.html_url,
  };
};

const escapePowerShellLiteral = (value) => `'${value.replace(/'/gu, "''")}'`;

const tryExtract = (command, args, extractDir) => {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `${command} ${args.join(' ')} failed while extracting to ${extractDir}: ${message}`,
    };
  }
};

const extractArtifact = async ({ zipPath, extractDir }) => {
  await mkdir(extractDir, { recursive: true });
  const attempts = [];

  if (process.platform === 'win32') {
    attempts.push(() =>
      tryExtract(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path ${escapePowerShellLiteral(
            zipPath,
          )} -DestinationPath ${escapePowerShellLiteral(extractDir)} -Force`,
        ],
        extractDir,
      ),
    );
  }

  attempts.push(() => tryExtract('tar', ['-xf', zipPath, '-C', extractDir], extractDir));
  attempts.push(() => tryExtract('unzip', ['-o', zipPath, '-d', extractDir], extractDir));

  const failures = [];
  for (const attempt of attempts) {
    const result = attempt();
    if (result.ok) {
      return;
    }
    failures.push(result.message);
  }

  throw new Error(
    `Unable to extract artifact archive ${zipPath}. Attempts:\n${failures.join('\n')}`,
  );
};

const main = async () => {
  const runIdArg = process.argv[2]?.trim() ?? '';
  const artifactName =
    process.argv[3]?.trim() ??
    process.env.RELEASE_SMOKE_ARTIFACT_NAME?.trim() ??
    DEFAULT_ARTIFACT_NAME;
  const outputDir =
    process.env.RELEASE_SMOKE_ARTIFACT_OUTPUT_DIR?.trim() ?? DEFAULT_OUTPUT_DIR;
  const workflowFile =
    process.env.RELEASE_WORKFLOW_FILE?.trim() ?? DEFAULT_WORKFLOW_FILE;
  const shouldExtract = parseBoolean(
    process.env.RELEASE_SMOKE_ARTIFACT_EXTRACT,
    DEFAULT_EXTRACT_ENABLED,
  );

  const token = resolveToken();
  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;

  const resolvedRun = runIdArg
    ? { id: parseRunId(runIdArg), runNumber: null, htmlUrl: null }
    : await findLatestDispatchRunId({ token, baseApiUrl, workflowFile });
  const runId = resolvedRun.id;

  const run = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}`,
  });
  const runNumber = run?.run_number ?? resolvedRun.runNumber ?? '<unknown>';
  const runUrl = run?.html_url ?? resolvedRun.htmlUrl ?? '<unknown>';

  const artifactsResponse = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/artifacts?per_page=100`,
  });
  const artifacts = Array.isArray(artifactsResponse?.artifacts)
    ? artifactsResponse.artifacts
    : [];
  const artifact = artifacts.find(
    (entry) => entry?.name === artifactName && entry?.expired === false,
  );

  if (!artifact?.id) {
    throw new Error(
      `Artifact '${artifactName}' not found for run ${runId}. Available: ${artifacts
        .map((entry) => entry?.name ?? '<unknown>')
        .join(', ')}`,
    );
  }

  const zipContent = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/artifacts/${artifact.id}/zip`,
    expectBinary: true,
  });

  await mkdir(outputDir, { recursive: true });
  const fileName = `ci-${artifactName}-run-${runId}.zip`;
  const outputPath = path.join(outputDir, fileName);
  await writeFile(outputPath, zipContent);
  const extractedDir = path.join(outputDir, `ci-run-${runId}`);

  if (shouldExtract) {
    await extractArtifact({
      zipPath: outputPath,
      extractDir: extractedDir,
    });
  }

  process.stdout.write(`Repository: ${repoSlug}\n`);
  process.stdout.write(`Run: #${runNumber} (id ${runId})\n`);
  process.stdout.write(`Run URL: ${runUrl}\n`);
  process.stdout.write(`Artifact: ${artifactName} (id ${artifact.id})\n`);
  process.stdout.write(`Saved: ${outputPath}\n`);
  if (shouldExtract) {
    process.stdout.write(`Extracted: ${extractedDir}\n`);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
