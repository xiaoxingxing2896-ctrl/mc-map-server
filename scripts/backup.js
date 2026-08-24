/**
 * SQLite 备份脚本（跨平台，Node 实现）：复制数据库到 backups/ 并保留最近 7 份。
 * 用法：npm run backup  （建议配合 cron / 计划任务每日执行）
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const KEEP = 7;

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const target = path.join(BACKUP_DIR, `mcmap-${stamp(new Date())}.db`);
fs.copyFileSync(config.dbPath, target);
console.log(`已备份: ${target} (${fs.statSync(target).size} bytes)`);

// 清理旧备份，只保留最近 KEEP 份
const backups = fs.readdirSync(BACKUP_DIR)
  .filter(f => /^mcmap-\d{8}-\d{6}\.db$/.test(f))
  .sort()
  .reverse();
for (const old of backups.slice(KEEP)) {
  fs.unlinkSync(path.join(BACKUP_DIR, old));
  console.log(`已清理旧备份: ${old}`);
}