// 存储层：统一数据访问接口。
//   db —— query(sql, params)/get(sql, params)/run(sql, params)
//        生产：Cloudflare D1；本地测试：dev-shims.js 的 sqlite3 实现
//   bucket —— listTiles()/getTile(key)
//        生产：Cloudflare R2；本地测试：dev-shims.js 的目录实现
// 两者接口完全一致，路由代码不感知后端差异。

// ---------- D1 实现 ----------
export function createDbFromD1(envDB) {
  return {
    async query(sql, params = []) {
      const res = await envDB.prepare(sql).bind(...params).all();
      return res.results || [];
    },
    async get(sql, params = []) {
      const res = await envDB.prepare(sql).bind(...params).get();
      return res && res.results ? res.results[0] : null;
    },
    async run(sql, params = []) {
      const res = await envDB.prepare(sql).bind(...params).run();
      return { changes: res.meta ? res.meta.changes : 0, lastRowId: res.meta ? res.meta.last_row_id : null };
    },
  };
}

// ---------- R2 实现 ----------
export function createBucketFromR2(bucket) {
  return {
    async listTiles() {
      const objects = [];
      let cursor;
      do {
        const res = await bucket.list(cursor ? { cursor } : {});
        objects.push(...res.objects);
        cursor = res.truncated ? res.cursor : undefined;
      } while (cursor);
      return objects;
    },
    async getTile(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      const buf = await obj.arrayBuffer();
      const type = (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/png';
      return { buf, type };
    },
  };
}