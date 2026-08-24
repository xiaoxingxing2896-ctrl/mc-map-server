/**
 * 瓦片索引路由：扫描 tiles 目录并按文件名解析世界坐标。
 * 命名格式与解析逻辑与原 server.js 完全一致。
 */
const express = require('express');
const fs = require('fs');
const config = require('../../config');

const router = express.Router();

router.get('/', (req, res) => {
  fs.readdir(config.tilesDir, (err, files) => {
    if (err) return res.status(500).json({ error: '无法读取瓦片目录' });
    const tiles = [];
    files.forEach(f => {
      if (!f.endsWith('.png') && !f.endsWith('.jpg') && !f.endsWith('.webp')) return;
      const match = f.match(/[xX](-?\d+)[zZ](-?\d+)/);
      if (match) {
        tiles.push({ x: parseInt(match[1]), z: parseInt(match[2]), url: `/tiles/${f}` });
      } else {
        const match2 = f.match(/\d+_\d+_x(-?\d+)_z(-?\d+)\./);
        if (match2) {
          tiles.push({ x: parseInt(match2[1]), z: parseInt(match2[2]), url: `/tiles/${f}` });
        }
      }
    });
    res.json(tiles);
  });
});

module.exports = router;