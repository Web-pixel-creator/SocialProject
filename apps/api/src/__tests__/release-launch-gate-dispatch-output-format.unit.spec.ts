import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const outputFormatModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'dispatch-production-launch-gate-output-format.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runBuildSummary = (input: unknown) => {
  const script = `
    import { buildDispatchInputSummaryLines } from ${JSON.stringify(outputFormatModuleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const result = buildDispatchInputSummaryLines(input);
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string[]>;
  return {
    output,
    payload,
  };
};

describe('launch-gate dispatch summary output formatter', () => {
  test('renders baseline lines without optional flags', () => {
    const result = runBuildSummary({
      allowFailureDrill: false,
      includeStepSummaryLink: true,
      printArtifactLinks: false,
      requiredExternalChannels: '',
      requireInlineHealthArtifacts: true,
      requireNaturalCronWindow: false,
      requireSkillMarkers: false,
      runtimeDraftId: '',
      selectedArtifactLinkNames: [],
      webhookSecretOverride: '',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual([
      'Require skill markers input: false',
      'Require natural cron window input: false',
      'Required external channels input: none',
      'Require inline health artifacts input: true',
      'Allow failure drill input: false',
      'Print artifact links option: false',
      'Include step summary link: true',
    ]);
  });

  test('renders optional lines in stable order when options are enabled', () => {
    const result = runBuildSummary({
      allowFailureDrill: true,
      includeStepSummaryLink: false,
      printArtifactLinks: true,
      requiredExternalChannels: 'all',
      requireInlineHealthArtifacts: true,
      requireNaturalCronWindow: true,
      requireSkillMarkers: true,
      runtimeDraftId: 'draft-123',
      selectedArtifactLinkNames: ['production-launch-gate-summary'],
      webhookSecretOverride: 'dummy-secret',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual([
      'Runtime draft id input: draft-123',
      'Require skill markers input: true',
      'Require natural cron window input: true',
      'Required external channels input: all',
      'Require inline health artifacts input: true',
      'Allow failure drill input: true',
      'Print artifact links option: true',
      'Include step summary link: false',
      'Artifact link names: production-launch-gate-summary',
      'Webhook secret override input: [provided]',
    ]);
  });
});
