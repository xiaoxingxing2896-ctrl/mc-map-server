/**
 * 历程记录（博客式相册）路由：与 Worker 版共用 worker/photos.js 里的 handler，
 * 这里只负责把 Express 的 req 包装成 fetch Request，并把 db/bucket 换成
 * sqlite3 / 目录实现（与 src/routes/tiles.js 同一套做法）。
 */
const express = require('express');
const config = require('../../config');
const { db } = require('../db');
const createTileStorage = require('../tile-storage');

const router = express.Router();
const bucket = createTileStorage(config.photosDir);

const ctx = {
  bucket,
  jwtSecret: config.jwtSecret,
  db: {
    get(sql, params = []) {
      return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
    },
    query(sql, params = []) {
      return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
    },
    run(sql, params = []) {
      return new Promise((resolve, reject) => db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ changes: this.changes, lastRowId: this.lastID });
      }));
    },
  },
};

// Request 是只读对象，用 Proxy 暴露 req.params（与 worker/app.js 的处理一致）
function withParams(request, params) {
  return new Proxy(request, {
    get(target, key) {
      if (key === 'params') return params;
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function send(response, res) {
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(response.status).send(await response.text());
}

function makeRequest(req, body) {
  const headers = {
    ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    'content-type': req.headers['content-type'] || 'application/json',
  };
  if (Buffer.isBuffer(body)) headers['content-length'] = String(body.length);
  return new Request('https://local.invalid' + req.originalUrl, { method: req.method, headers, body });
}

// handler 以 (request, ctx) 调用；缺省把 Express 的 req 包成带 params 的 Request
function route(handler, { body, params } = {}) {
  return async (req, res, next) => {
    try {
      const request = makeRequest(req, body ? body(req) : undefined);
      await send(await handler(params ? withParams(request, params(req)) : request, ctx), res);
    } catch (e) {
      if (e && e.status && e.msg) res.status(e.status).json({ error: e.msg });
      else next(e);
    }
  };
}

const P = () => import('../../worker/photos.js');
const id = (req) => ({ id: String(req.params.id) });
const json = (req) => JSON.stringify(req.body || {});

router.get('/', route((request, c) => P().then(mod => mod.listPosts(request, c))));

router.post('/', route((request, c) => P().then(mod => mod.createPost(request, c)), { body: json }));

router.get('/:id', route((request, c) => P().then(mod => mod.getPost(request, c)), { params: id }));

router.put('/:id', route((request, c) => P().then(mod => mod.updatePost(request, c)), { body: json, params: id }));

router.delete('/:id', route((request, c) => P().then(mod => mod.deletePost(request, c)), { params: id }));

// 图片：raw body + ?name= 文件名，与 PUT /api/tiles 的用法一致
router.put('/:id/photos', require('../middleware').authenticate,
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '10mb' }),
  route((request, c) => P().then(mod => mod.uploadPhoto(request, c)),
    { body: req => Buffer.isBuffer(req.body) ? req.body : undefined, params: id }));

router.delete('/:id/photos', route((request, c) => P().then(mod => mod.deletePhoto(request, c)), { params: id }));

module.exports = router;
module.exports.bucket = bucket;
module.exports.ctx = ctx;
