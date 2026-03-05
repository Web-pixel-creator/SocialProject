import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const linkOptionsModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'dispatch-production-launch-gate-link-options.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runModuleAction = <T>({
  action,
  input,
}: {
  action: 'constants' | 'parse' | 'resolve';
  input: unknown;
}) => {
  const script = `
    import {
      ALLOWED_ARTIFACT_LINK_NAMES,
      LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
      OPTIONAL_ARTIFACT_LINK_NAMES,
      parseArtifactLinkNames,
      resolveDispatchArtifactLinkOptions,
    } from ${JSON.stringify(linkOptionsModuleHref)};

    const action = ${JSON.stringify(action)};
    const input = ${JSON.stringify(input)};

    try {
      let result;
      if (action === 'constants') {
        result = {
          ALLOWED_ARTIFACT_LINK_NAMES,
          LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
          OPTIONAL_ARTIFACT_LINK_NAMES,
        };
      } else if (action === 'parse') {
        result = parseArtifactLinkNames(input.raw, input.sourceLabel);
      } else {
        result = resolveDispatchArtifactLinkOptions(input);
      }
      process.stdout.write(JSON.stringify({ ok: true, result, error: '' }));
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    }
  `;

  const output = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
  const payload = JSON.parse(output.stdout) as ModuleActionResult<T>;
  return {
    output,
    payload,
  };
};

describe('launch-gate dispatch link options resolver', () => {
  test('parses all keyword into optional artifact list', () => {
    const constantsResult = runModuleAction<{
      OPTIONAL_ARTIFACT_LINK_NAMES: string[];
    }>({
      action: 'constants',
      input: {},
    });
    const parseResult = runModuleAction<string[]>({
      action: 'parse',
      input: { raw: 'all', sourceLabel: '--artifact-link-names' },
    });
    expect(constantsResult.output.status).toBe(0);
    expect(parseResult.output.status).toBe(0);
    expect(parseResult.payload.result).toEqual(
      constantsResult.payload.result.OPTIONAL_ARTIFACT_LINK_NAMES,
    );
  });

  test('filters step-summary artifact name from parsed subset', () => {
    const constantsResult = runModuleAction<{
      LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME: string;
    }>({
      action: 'constants',
      input: {},
    });
    const parseResult = runModuleAction<string[]>({
      action: 'parse',
      input: {
        raw: `${constantsResult.payload.result.LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME},production-launch-gate-summary`,
        sourceLabel: '--artifact-link-names',
      },
    });
    expect(parseResult.output.status).toBe(0);
    expect(parseResult.payload.result).toEqual([
      'production-launch-gate-summary',
    ]);
  });

  test('throws on unsupported artifact names', () => {
    const parseResult = runModuleAction<string[]>({
      action: 'parse',
      input: {
        raw: 'unknown-artifact',
        sourceLabel: '--artifact-link-names',
      },
    });
    expect(parseResult.output.status).toBe(1);
    expect(parseResult.payload.ok).toBe(false);
    expect(parseResult.payload.error).toContain(
      'contains unsupported artifact names',
    );
  });

  test('defaults to no extra links and keeps step-summary enabled', () => {
    const resolved = runModuleAction<{
      includeStepSummaryLink: boolean;
      printArtifactLinks: boolean;
      selectedArtifactLinkNames: string[];
    }>({
      action: 'resolve',
      input: {
        cliArtifactLinkNames: [],
        envArtifactLinkNamesRaw: '',
        envNoStepSummaryLinkRaw: '',
        envPrintArtifactLinksRaw: '',
      },
    });
    expect(resolved.output.status).toBe(0);
    expect(resolved.payload.result.printArtifactLinks).toBe(false);
    expect(resolved.payload.result.selectedArtifactLinkNames).toEqual([]);
    expect(resolved.payload.result.includeStepSummaryLink).toBe(true);
  });

  test('enables verbose links from cli print flag without explicit subset', () => {
    const constantsResult = runModuleAction<{
      OPTIONAL_ARTIFACT_LINK_NAMES: string[];
    }>({
      action: 'constants',
      input: {},
    });
    const resolved = runModuleAction<{
      includeStepSummaryLink: boolean;
      printArtifactLinks: boolean;
      selectedArtifactLinkNames: string[];
    }>({
      action: 'resolve',
      input: {
        cliArtifactLinkNames: [],
        cliPrintArtifactLinks: true,
        envArtifactLinkNamesRaw: '',
        envNoStepSummaryLinkRaw: '',
        envPrintArtifactLinksRaw: '',
      },
    });
    expect(resolved.output.status).toBe(0);
    expect(resolved.payload.result.printArtifactLinks).toBe(true);
    expect(resolved.payload.result.selectedArtifactLinkNames).toEqual(
      constantsResult.payload.result.OPTIONAL_ARTIFACT_LINK_NAMES,
    );
    expect(resolved.payload.result.includeStepSummaryLink).toBe(true);
  });

  test('treats explicit artifact names as enabling verbose links', () => {
    const resolved = runModuleAction<{
      includeStepSummaryLink: boolean;
      printArtifactLinks: boolean;
      selectedArtifactLinkNames: string[];
    }>({
      action: 'resolve',
      input: {
        cliArtifactLinkNames: ['production-launch-gate-summary'],
        envArtifactLinkNamesRaw: '',
        envNoStepSummaryLinkRaw: '',
        envPrintArtifactLinksRaw: '',
      },
    });
    expect(resolved.output.status).toBe(0);
    expect(resolved.payload.result.printArtifactLinks).toBe(true);
    expect(resolved.payload.result.selectedArtifactLinkNames).toEqual([
      'production-launch-gate-summary',
    ]);
  });

  test('supports env-driven subset and step-summary suppression', () => {
    const resolved = runModuleAction<{
      includeStepSummaryLink: boolean;
      printArtifactLinks: boolean;
      selectedArtifactLinkNames: string[];
    }>({
      action: 'resolve',
      input: {
        cliArtifactLinkNames: [],
        envArtifactLinkNamesRaw:
          'production-launch-gate-summary,post-release-health-inline-artifacts-schema-check',
        envNoStepSummaryLinkRaw: 'true',
        envPrintArtifactLinksRaw: '',
      },
    });
    expect(resolved.output.status).toBe(0);
    expect(resolved.payload.result.printArtifactLinks).toBe(true);
    expect(resolved.payload.result.includeStepSummaryLink).toBe(false);
    expect(resolved.payload.result.selectedArtifactLinkNames).toEqual([
      'production-launch-gate-summary',
      'post-release-health-inline-artifacts-schema-check',
    ]);
  });
});
