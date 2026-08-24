/**
 * 标注路由：查询 / 详情 / 新增 / 修改 / 删除。
 * 行为与原 server.js 一致，另补充 x/z 整数校验（不改变正常使用路径）。
 */
const express = require('express');
const { db } = require('../db');
const { authenticate, optionalAuth } = require('../middleware');

const router = express.Router();

function isInt(v) {
  return v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v));
}

function safeIcon(icon, fallback) {
  if (typeof icon === 'string' && Array.from(icon).length <= 3 && icon.trim() !== '') {
    return icon.trim();
  }
  return fallback || '';
}

router.get('/', optionalAuth, (req, res) => {
  if (req.user) {
    db.all(
      "SELECT * FROM markers WHERE is_public = 1 OR created_by = ? ORDER BY created_at DESC",
      [req.user.username],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  } else {
    db.all("SELECT * FROM markers WHERE is_public = 1 ORDER BY created_at DESC", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

router.get('/:id', (req, res) => {
  db.get("SELECT * FROM markers WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '标注不存在' });
    res.json(row);
  });
});

router.post('/', authenticate, (req, res) => {
  const { x, z, title, description, category, isPublic, icon } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: '标题不能为空' });
  }
  if (!isInt(x) || !isInt(z)) {
    return res.status(400).json({ error: 'x/z 必须是整数' });
  }
  db.run(`INSERT INTO markers (x, z, title, description, category, created_by, is_public, icon)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(x), Number(z), title.trim(), description || '', category || 'other', req.user.username, isPublic ? 1 : 0, safeIcon(icon)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get("SELECT * FROM markers WHERE id = ?", [this.lastID], (err2, row) => res.json(row));
    });
});

router.put('/:id', authenticate, (req, res) => {
  const { title, description, category, isPublic, x, z, icon } = req.body || {};
  db.get("SELECT * FROM markers WHERE id = ?", [req.params.id], (err, marker) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!marker) return res.status(404).json({ error: '标注不存在' });
    if (marker.created_by !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: '无权修改' });
    }
    if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if ((x !== undefined && !isInt(x)) || (z !== undefined && !isInt(z))) {
      return res.status(400).json({ error: 'x/z 必须是整数' });
    }
    const safeIconValue = safeIcon(icon, marker.icon);
    db.run(`UPDATE markers SET title=?, description=?, category=?, is_public=?, x=?, z=?, icon=? WHERE id=?`,
      [title !== undefined ? title.trim() : marker.title,
       description !== undefined ? description : marker.description,
       category || 'other',
       isPublic ? 1 : 0,
       x !== undefined ? Number(x) : marker.x,
       z !== undefined ? Number(z) : marker.z,
       safeIconValue,
       req.params.id],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get("SELECT * FROM markers WHERE id = ?", [req.params.id], (err3, row) => res.json(row));
      });
  });
});

router.delete('/:id', authenticate, (req, res) => {
  db.get("SELECT * FROM markers WHERE id = ?", [req.params.id], (err, marker) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!marker) return res.status(404).json({ error: '标注不存在' });
    if (marker.created_by !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: '无权删除' });
    }
    db.run("DELETE FROM markers WHERE id = ?", [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: '已删除' });
    });
  });
});

module.exports = router;