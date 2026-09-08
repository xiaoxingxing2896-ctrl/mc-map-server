const express = require('express');
const fs = require('node:fs');
const config = require('../../config');
const { db } = require('../db');
const createTileStorage = require('../tile-storage');
const router = express.Router();
const bucket = createTileStorage(config.tilesDir);
const ctx = { bucket, jwtSecret: config.jwtSecret, db: {
  get(sql, params) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); },
} };
async function send(response, res) {
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(response.status).send(await response.text());
}
router.get('/', async (req, res, next) => {
  try {
    if (!fs.existsSync(config.tilesDir)) return res.status(500).json({ error: '无法读取瓦片目录' });
    const { listTiles } = await import('../../worker/routes.js');
    await send(await listTiles(new Request('https://local.invalid' + req.originalUrl), ctx), res);
  } catch (e) { next(e); }
});
router.put('/', require('../middleware').authenticate, express.raw({ type: 'image/png', limit: '8mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: '需要 image/png 请求体' });
    const { uploadTile } = await import('../../worker/tile-upload.js');
    const request = new Request('https://local.invalid' + req.originalUrl, { method: 'PUT', headers: {
      authorization: req.headers.authorization, 'content-type': 'image/png', ...(req.headers['if-match'] ? { 'if-match': req.headers['if-match'] } : {}),
    }, body: req.body });
    await send(await uploadTile(request, ctx), res);
  } catch (e) { if (e.status && e.msg) res.status(e.status).json({ error: e.msg }); else next(e); }
});
module.exports = router;
