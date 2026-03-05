import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

export interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

export const resolveProjectModuleHref = (...segments: string[]) =>
  pathToFileURL(path.join(projectRoot, ...segments)).href;

export const runInlineModuleScript = <T>(script: string) => {
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

export const resolveProjectPath = (...segments: string[]) =>
  path.join(projectRoot, ...segments);
