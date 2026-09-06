// Backwards-compatible entry point: isolated tests, no live database required.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', 'test/express.test.mjs'], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
