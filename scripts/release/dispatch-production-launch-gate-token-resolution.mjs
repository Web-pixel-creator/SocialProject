const isAsciiVisible = (value) => /^[\x21-\x7E]+$/u.test(value);

export const resolveDispatchTokenCandidates = ({
  envGithubToken,
  envGhToken,
  ghAuthToken,
  tokenFromArg,
}) => {
  const candidates = [];
  const addCandidate = (token, source) => {
    const normalized = token?.trim();
    if (!normalized) {
      return;
    }
    if (!isAsciiVisible(normalized)) {
      throw new Error(
        `Token from '${source}' contains unsupported characters. Use the exact GitHub token value (ASCII only), without placeholders, spaces, or localized text.`,
      );
    }
    if (candidates.some((entry) => entry.token === normalized)) {
      return;
    }
    candidates.push({
      token: normalized,
      source,
    });
  };

  addCandidate(tokenFromArg, 'cli-arg');
  addCandidate(envGithubToken, 'env:GITHUB_TOKEN');
  addCandidate(envGhToken, 'env:GH_TOKEN');
  addCandidate(ghAuthToken, 'gh-auth');

  return candidates;
};
