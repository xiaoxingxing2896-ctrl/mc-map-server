/**
 * 用户管理路由（owner/admin）：列表 / 角色修改。
 */
const express = require('express');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();

router.get('/', authenticate, requireRole('owner', 'admin'), (req, res) => {
  db.all("SELECT id, username, role, created_at FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.put('/:id/role', authenticate, requireRole('owner', 'admin'), (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const newRole = req.body && req.body.role;
  if (!['user', 'admin'].includes(newRole) && newRole !== 'owner') {
    return res.status(400).json({ error: '无效的角色' });
  }
  db.get("SELECT * FROM users WHERE id = ?", [targetId], (err, target) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (targetId === req.user.id) {
      return res.status(403).json({ error: '无法修改自己的权限' });
    }
    if (req.user.role === 'admin' && (target.role === 'owner' || target.role === 'admin')) {
      return res.status(403).json({ error: '无权修改该用户的权限' });
    }
    db.run("UPDATE users SET role = ? WHERE id = ?", [newRole, targetId], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: '权限已更新' });
    });
  });
});

module.exports = router;