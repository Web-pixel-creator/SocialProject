import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/render-release-smoke-preflight-schema-summary.mjs --input <summary.json> --output <summary.md> [--title <text>]

Options:
  --input   Path to release smoke preflight schema summary JSON.
  --output  Path to markdown file that should be appended to GITHUB_STEP_SUMMARY.
  --title   Optional markdown heading. Default: "### Release Smoke Preflight Schema Summary".
  --help    Show help.
`;

const parseArgs = (argv) => {
  const options = {
    inputPath: '',
    outputPath: '',
    title: '### Release Smoke Preflight Schema Summary',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--input') {
      options.inputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--title') {
      options.title = argv[index + 1] ?? options.title;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.inputPath || !options.outputPath) {
    throw new Error(`Both --input and --output are required.\n\n${USAGE}`);
  }

  return options;
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.inputPath);
  const outputPath = path.resolve(process.cwd(), options.outputPath);
  const lines = [options.title, ''];

  if (!existsSync(inputPath)) {
    lines.push('- summary: `missing`', '');
  } else {
    try {
      const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
      lines.push(
        `- status: \`${String(payload.status ?? 'unknown')}\``,
        `- validated payloads: \`${String(payload?.totals?.validatedPayloads ?? 0)}\``,
        `- fixture payloads: \`${String(payload?.totals?.fixturePayloads ?? 0)}\``,
        `- runtime payloads: \`${String(payload?.totals?.runtimePayloads ?? 0)}\``,
      );

      if (Array.isArray(payload.failures) && payload.failures.length > 0) {
        lines.push('', 'Failures:');
        for (const failure of payload.failures) {
          lines.push(`- ${String(failure)}`);
        }
      }
      lines.push('');
    } catch (error) {
      lines.push(`- summary parse error: \`${toErrorMessage(error)}\``, '');
    }
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
};

try {
  main();
} catch (error) {
  const message = toErrorMessage(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
