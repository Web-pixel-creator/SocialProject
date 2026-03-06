const DEFAULT_WEB_TEST_PATH = 'apps/web/src/__tests__';

const TARGET_FLAGS = new Set([
  '--findRelatedTests',
  '--projects',
  '--runTestsByPath',
  '--selectProjects',
]);

const hasExplicitTestTarget = (args) =>
  args.some((arg) => !arg.startsWith('-') || TARGET_FLAGS.has(arg));

const resolveWebJestArgs = (args) =>
  hasExplicitTestTarget(args) ? [...args] : [...args, DEFAULT_WEB_TEST_PATH];

module.exports = {
  DEFAULT_WEB_TEST_PATH,
  resolveWebJestArgs,
};
