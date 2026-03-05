import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runHelp = () =>
  spawnSync(
    process.execPath,
    ['scripts/release/dispatch-staging-smoke.mjs', '--help'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

const normalizeLineEndings = (value: string) => value.replace(/\r\n/gu, '\n');

describe('staging smoke dispatch helper help output', () => {
  test('matches golden usage snapshots by section', () => {
    const result = runHelp();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const normalized = normalizeLineEndings(result.stdout).trimEnd();
    const sections = normalized.split('\n\n');

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchInlineSnapshot(
      `"Usage: npm run release:smoke:dispatch -- [--token <value>|-Token <value>|--token=<value>|-Token=<value>]"`,
    );
    expect(sections[1]).toMatchInlineSnapshot(`
"Token resolution order:
1) --token / -Token argument
2) GITHUB_TOKEN / GH_TOKEN
3) gh auth token"
`);
  });
});
