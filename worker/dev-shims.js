// 本地回归测试专用 shim（仅 Node 环境，部署时不被引用）：
//  - createDbFromSqlite：基于项目 node_modules 的 sqlite3，行为对齐 D1 接口
//  - createBucketFromDir：基于本地目录，行为对齐 R2 接口
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function createDbFromSqlite(sqlite3db) {
  const db = sqlite3db;
  const p = (fn, sql, params) => new Promise((resolve, reject) => {
    db[fn](sql, params || [], function (err, rows) {
      if (err) return reject(err);
      resolve(fn === 'run' ? { changes: this.changes, lastRowId: this.lastID } : rows);
    });
  });
  return {
    async query(sql, params = []) { return p('all', sql, params); },
    async get(sql, params = []) { return (await p('get', sql, params)) || null; },
    async run(sql, params = []) { return p('run', sql, params); },
  };
}

export function createBucketFromDir(dir) {
  return require('../src/tile-storage.js')(dir);
}
