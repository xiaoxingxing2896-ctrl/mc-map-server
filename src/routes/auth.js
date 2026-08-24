/**
 * 认证路由：注册 / 登录 / 修改账号信息 / 当前用户。
 * 行为与原 server.js 一致，另补充用户名长度与类型校验。
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { db } = require('../db');
const { authenticate } = require('../middleware');

const router = express.Router();

function isValidUsername(u) {
  return typeof u === 'string' && u.trim().length >= 3 && u.trim().length <= 32;
}

router.post('/register', (req, res) => {
  const username = req.body && req.body.username;
  const password = req.body && req.body.password;
  if (!isValidUsername(username) || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: '用户名或密码无效（用户名3-32位，密码至少4位）' });
  }
  bcrypt.hash(password, 10).then(hash => {
    db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [username.trim(), hash], function (err) {
        if (err) return res.status(400).json({ error: '用户名已存在' });
        res.json({ message: '注册成功', userId: this.lastID });
      });
  });
});

router.post('/login', (req, res) => {
  const username = req.body && req.body.username;
  const password = req.body && req.body.password;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  db.get("SELECT * FROM users WHERE username = ?", [username.trim()], (err, user) => {
    if (err || !user) return res.status(401).json({ error: '用户名或密码错误' });
    bcrypt.compare(password, user.password_hash).then(ok => {
      if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );
      res.json({ token, username: user.username, role: user.role });
    });
  });
});

router.put('/update', authenticate, (req, res) => {
  const { oldPassword, newUsername, newPassword } = req.body || {};
  if (typeof oldPassword !== 'string' || !isValidUsername(newUsername) || typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ error: '旧密码、新用户名或新密码无效' });
  }
  db.get("SELECT * FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(401).json({ error: '用户不存在' });
    bcrypt.compare(oldPassword, user.password_hash).then(ok => {
      if (!ok) return res.status(401).json({ error: '旧密码错误' });
      db.get("SELECT id FROM users WHERE username = ? AND id != ?", [newUsername.trim(), user.id], (err2, exists) => {
        if (exists) return res.status(400).json({ error: '用户名已存在' });
        bcrypt.hash(newPassword, 10).then(newHash => {
          db.run("UPDATE users SET username = ?, password_hash = ? WHERE id = ?",
            [newUsername.trim(), newHash, user.id], function (err3) {
              if (err3) return res.status(500).json({ error: err3.message });
              const token = jwt.sign(
                { id: user.id, username: newUsername.trim(), role: user.role },
                config.jwtSecret,
                { expiresIn: config.jwtExpiresIn }
              );
              res.json({ message: '信息已更新', token, username: newUsername.trim() });
            });
        });
      });
    });
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

module.exports = router;