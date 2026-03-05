const TOKEN_FLAG_ARGUMENTS = ['--token', '--Token', '-Token', '-token'];
const TOKEN_INLINE_PREFIXES = ['--token=', '--Token=', '-Token=', '-token='];
const PLACEHOLDER_ANGLE_BRACKETS_PATTERN = /^<[^>]+>$/u;
const PLACEHOLDER_TOKEN_MARKERS_PATTERN = /NEW_GITHUB_PAT|YOUR_TOKEN|TOKEN_HERE/u;

const isTokenFlagArgument = (arg) => TOKEN_FLAG_ARGUMENTS.includes(arg);
const isTokenInlineArgument = (arg) =>
  TOKEN_INLINE_PREFIXES.some((prefix) => arg.startsWith(prefix));

export const parseDispatchTokenCliArg = ({ arg, argv, index, usage }) => {
  if (isTokenFlagArgument(arg)) {
    const value = String(argv[index + 1] ?? '').trim();
    if (!value) {
      throw new Error(`Missing value for ${arg}.\n\n${usage}`);
    }
    return {
      matched: true,
      nextIndex: index + 1,
      tokenFromArg: value,
    };
  }

  if (isTokenInlineArgument(arg)) {
    const value = arg.slice(arg.indexOf('=') + 1).trim();
    if (!value) {
      throw new Error(`Missing value for ${arg}.\n\n${usage}`);
    }
    return {
      matched: true,
      nextIndex: index,
      tokenFromArg: value,
    };
  }

  return {
    matched: false,
    nextIndex: index,
    tokenFromArg: '',
  };
};

export const assertDispatchTokenNotPlaceholder = (tokenFromArg) => {
  if (!tokenFromArg) {
    return;
  }
  if (
    PLACEHOLDER_ANGLE_BRACKETS_PATTERN.test(tokenFromArg) ||
    PLACEHOLDER_TOKEN_MARKERS_PATTERN.test(tokenFromArg)
  ) {
    throw new Error(
      `Token argument looks like a placeholder ('${tokenFromArg}'). Pass a real PAT value without angle brackets.`,
    );
  }
};
