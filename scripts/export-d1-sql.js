/**
 * 将现有 SQLite 数据库（mcmap.db）导出为 INSERT SQL，用于迁移到 Cloudflare D1。
 * 用法：
 *   node scripts/export-d1-sql.js [dbFile] [outFile]
 *   - 不传 outFile：SQL 打印到 stdout（重定向时注意编码，推荐传 outFile）
 *   - 传 outFile：直接写入 UTF-8 文件（无 BOM），如：
 *       node scripts/export-d1-sql.js mcmap.db migrate.sql
 *   然后：wrangler d1 execute mc-map-db --remote --file=migrate.sql
 */
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbFile = process.argv[2] || path.join(__dirname, '..', 'mcmap.db');
const outFile = process.argv[3] || null;
const db = new sqlite3.Database(dbFile);

const lines = [];
function out(s) { lines.push(s); }

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function emit(table, cols, rows) {
  const colList = cols.join(', ');
  for (const r of rows) {
    const vals = cols.map(c => esc(r[c])).join(', ');
    out(`INSERT INTO ${table} (${colList}) VALUES (${vals});`);
  }
}

db.serialize(() => {
  db.all("SELECT id, username, password_hash, role, created_at FROM users", [], (e, rows) => {
    if (e) { console.error(e); process.exit(1); }
    emit('users', ['id', 'username', 'password_hash', 'role', 'created_at'], rows);
  });
  db.all("SELECT id, x, z, title, description, category, icon, created_by, created_at, is_public FROM markers", [], (e, rows) => {
    if (e) { console.error(e); process.exit(1); }
    emit('markers', ['id', 'x', 'z', 'title', 'description', 'category', 'icon', 'created_by', 'created_at', 'is_public'], rows);
    if (outFile) {
      fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
      console.log(`已导出到 ${outFile}（${lines.length} 条语句）`);
    } else {
      process.stdout.write(lines.join('\n') + '\n');
    }
    db.close();
  });
});