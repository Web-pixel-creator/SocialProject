import { toErrorMessage } from './release-runtime-utils.mjs';

const AUTH_ERROR_MARKERS = [
  ' 401 ',
  'Bad credentials',
  'Requires authentication',
  'Resource not accessible by integration',
];

const DEFAULT_MISSING_TOKEN_MESSAGE =
  'Missing GitHub token. Provide --token/-Token, or set GITHUB_TOKEN/GH_TOKEN, or run gh auth login.';
const DEFAULT_UNABLE_TO_RESOLVE_MESSAGE =
  'Unable to resolve a working GitHub token.';

export const isGitHubAuthenticationError = (message) =>
  AUTH_ERROR_MARKERS.some((marker) => message.includes(marker));

export const selectDispatchTokenCandidate = async ({
  candidates,
  probeUrl,
  probeAuth,
  writeWarning = (message) => {
    process.stderr.write(message);
  },
  missingTokenMessage = DEFAULT_MISSING_TOKEN_MESSAGE,
  unableToResolveMessage = DEFAULT_UNABLE_TO_RESOLVE_MESSAGE,
} = {}) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(missingTokenMessage);
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await probeAuth({
        token: candidate.token,
        url: probeUrl,
      });
      if (index > 0) {
        writeWarning(
          `GitHub auth fallback: using token source '${candidate.source}'.\n`,
        );
      }
      return candidate;
    } catch (error) {
      const message = toErrorMessage(error);
      const hasNextCandidate = index + 1 < candidates.length;
      if (!hasNextCandidate || !isGitHubAuthenticationError(message)) {
        throw error;
      }
      writeWarning(
        `GitHub token source '${candidate.source}' failed auth, trying next source.\n`,
      );
    }
  }

  throw new Error(unableToResolveMessage);
};
