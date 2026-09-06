const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const sqlite3 = require('sqlite3');

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-scripts-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function runScript(name, root, extra = {}) {
  const filename = path.resolve(__dirname, '../scripts', name);
  return vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require, console, Buffer, AbortSignal,
    __dirname: path.join(root, 'scripts'), ...extra,
  }, { filename });
}
test('backup retains seven newest backups and never removes unrelated files', t => {
  const root = temporary(t), backups = path.join(root, 'backups'), source = path.join(root, 'source.db');
  fs.mkdirSync(backups); fs.writeFileSync(source, 'database fixture');
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(backups, `mcmap-2020010${i}-000000.db`), 'old');
  fs.writeFileSync(path.join(backups, 'keep.txt'), 'keep');
  runScript('backup.js', root, { require: name => name === '../config' ? { dbPath: source } : require(name) });
  const files = fs.readdirSync(backups).filter(f => f.endsWith('.db')).sort();
  assert.equal(files.length, 7); assert.equal(files[0], 'mcmap-20200104-000000.db');
  assert.equal(fs.readFileSync(path.join(backups, files.at(-1)), 'utf8'), 'database fixture');
  assert.equal(fs.readFileSync(path.join(backups, 'keep.txt'), 'utf8'), 'keep');
});
test('vendor download falls back to another CDN and fails when every source fails', async t => {
  const root = temporary(t); let exitCode, calls = [];
  await runScript('fetch-vendor.js', root, {
    process: { exit(code) { exitCode = code; } },
    fetch: async url => { calls.push(url); return url.includes('unpkg') ? new Response('', { status: 503 }) : new Response('fixture asset'); },
  });
  assert.equal(exitCode, 0); assert.equal(calls.length, 4);
  for (const name of ['leaflet.js', 'leaflet.css']) assert.equal(fs.readFileSync(path.join(root, 'public/vendor', name), 'utf8'), 'fixture asset');
  calls = [];
  await runScript('fetch-vendor.js', root, {
    process: { exit(code) { exitCode = code; } },
    fetch: async url => { calls.push(url); throw new Error('offline'); },
  });
  assert.equal(exitCode, 1); assert.equal(calls.length, 6);
});
test('SQL export round-trips quotes, Unicode, NULL and private negative-coordinate markers', async t => {
  const root = temporary(t), input = path.join(root, 'input.db'), output = path.join(root, 'export.sql');
  const source = new sqlite3.Database(input), target = new sqlite3.Database(':memory:');
  t.after(() => new Promise(resolve => target.close(resolve)));
  const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  const schema = `CREATE TABLE users (id, username, password_hash, role, created_at);
    CREATE TABLE markers (id, x, z, title, description, category, icon, created_by, created_at, is_public);`;
  await exec(source, schema + `INSERT INTO users VALUES (1, 'O''Brien', 'test-hash', 'user', NULL);
    INSERT INTO markers VALUES (1, -10, 0, '玩家''s 家', NULL, 'other', '🏠', 'O''Brien', NULL, 0);`);
  await new Promise(resolve => source.close(resolve));
  await promisify(execFile)(process.execPath, [path.resolve(__dirname, '../scripts/export-d1-sql.js'), input, output]);
  const sql = fs.readFileSync(output, 'utf8');
  await exec(target, schema + sql);
  const row = await new Promise((resolve, reject) => target.get('SELECT * FROM markers', (e, row) => e ? reject(e) : resolve(row)));
  assert.equal(row.title, "玩家's 家"); assert.equal(row.description, null);
  assert.equal(Number(row.x), -10); assert.equal(Number(row.is_public), 0);
  const stdout = await promisify(execFile)(process.execPath, [path.resolve(__dirname, '../scripts/export-d1-sql.js'), input]);
  assert.equal(stdout.stdout, sql);
});
