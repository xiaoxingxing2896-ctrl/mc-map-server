// Backwards-compatible entry point: isolated SQLite and mocked external services.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.execPath, ['--test', 'test/worker-*.test.mjs'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
