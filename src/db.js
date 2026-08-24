/**
 * SQLite 初始化：建表 + 默认 Owner 引导（表结构与原 server.js 完全一致）。
 */
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

if (!fs.existsSync(path.dirname(config.dbPath))) {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}

const db = new sqlite3.Database(config.dbPath);

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          x INTEGER NOT NULL,
          z INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT DEFAULT 'other',
          icon TEXT DEFAULT 'marker',
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_public INTEGER DEFAULT 1
      )`);

      db.get("SELECT * FROM users WHERE role = 'owner'", (err, owner) => {
        if (err) return reject(err);
        if (owner) return resolve();
        db.get("SELECT * FROM users WHERE role = 'admin'", (err, admin) => {
          if (err) return reject(err);
          if (admin) {
            db.run("UPDATE users SET role = 'owner' WHERE id = ?", [admin.id], (err2) => {
              if (err2) return reject(err2);
              console.log('已自动将原 admin 升级为 Owner');
              resolve();
            });
          } else {
            // 全新部署：可用 ADMIN_PASSWORD 指定初始密码，否则生成随机密码打印在日志
            const password = config.adminPassword || crypto.randomBytes(9).toString('base64url').slice(0, 12);
            bcrypt.hash(password, 10).then(hash => {
              db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ['admin', hash, 'owner'], function (err3) {
                  if (err3) return reject(err3);
                  if (config.adminPassword) {
                    console.log('已创建默认 Owner 账号: admin（密码由 ADMIN_PASSWORD 指定）');
                  } else {
                    console.log(`已创建默认 Owner 账号: admin / ${password}（请立即登录修改密码）`);
                  }
                  resolve();
                });
            }).catch(reject);
          }
        });
      });
    });
  });
}

module.exports = { db, initDatabase };