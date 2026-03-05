import { execFileSync } from 'node:child_process';

const readTokenFromGhAuthCommand = () =>
  execFileSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

export const readGitHubTokenFromGhAuth = ({
  readToken = readTokenFromGhAuthCommand,
} = {}) => {
  try {
    return String(readToken() ?? '').trim();
  } catch {
    return '';
  }
};
