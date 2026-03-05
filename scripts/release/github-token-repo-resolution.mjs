import { execFileSync } from 'node:child_process';

const CREDENTIAL_STORE_INPUT = 'protocol=https\nhost=github.com\n\n';

export const readOriginRemote = () => {
  const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8',
  }).trim();
  if (!remote) {
    throw new Error('Git remote origin is not configured.');
  }
  return remote;
};

export const parseRepoSlugFromRemote = (remote) => {
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

export const resolveRepoSlug = ({
  githubRepository = process.env.GITHUB_REPOSITORY,
} = {}) => {
  const fromEnv = String(githubRepository ?? '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return parseRepoSlugFromRemote(readOriginRemote());
};

export const readTokenFromGitCredentialStore = ({ allowMissing = false } = {}) => {
  const output = execFileSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: CREDENTIAL_STORE_INPUT,
  });

  const tokenLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith('password='));
  if (!tokenLine) {
    if (allowMissing) {
      return '';
    }
    throw new Error(
      'Unable to resolve GitHub token from credential store. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }

  const token = tokenLine.slice('password='.length).trim();
  if (!token) {
    if (allowMissing) {
      return '';
    }
    throw new Error(
      'Git credential store returned empty password. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }
  return token;
};

export const resolveToken = ({
  allowMissing = false,
  envGhToken = process.env.GH_TOKEN,
  envGithubToken = process.env.GITHUB_TOKEN,
} = {}) => {
  const githubToken = String(envGithubToken ?? '').trim();
  if (githubToken) {
    return githubToken;
  }
  const ghToken = String(envGhToken ?? '').trim();
  if (ghToken) {
    return ghToken;
  }
  return readTokenFromGitCredentialStore({
    allowMissing,
  });
};
