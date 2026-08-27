// 存储层：统一数据访问接口。
//   db —— query(sql, params)/get(sql, params)/run(sql, params)
//        生产：Cloudflare D1；本地测试：dev-shims.js 的 sqlite3 实现
//   bucket —— listTiles()/getTile(key)
//        生产：Cloudflare R2；本地测试：dev-shims.js 的目录实现
// 两者接口完全一致，路由代码不感知后端差异。

// ---------- D1 实现 ----------
// 关键修复：
//  1) 无占位符参数的 SQL 不应调用 .bind()，否则 D1 会抛错
//  2) D1 的 PreparedStatement 没有 .get()（那是 sqlite3 的 API）！
//     取单行必须用 .first()，否则查询 users/markers 时抛"not a function"
export function createDbFromD1(envDB) {
    const prep = (sql, params) => {
        const stmt = envDB.prepare(sql);
        return params && params.length ? stmt.bind(...params) : stmt;
    };
    return {
        async query(sql, params = []) {
            const res = await prep(sql, params).all();
            return res.results || [];
        },
        async get(sql, params = []) {
            // D1 用 .first() 获取第一行（返回行对象或 null）
            const row = await prep(sql, params).first();
            return row || null;
        },
        async run(sql, params = []) {
            const res = await prep(sql, params).run();
            return { changes: res.meta ? res.meta.changes : 0, lastRowId: res.meta ? res.meta.last_row_id : null };
        },
    };
}

// ---------- R2 实现 ----------
export function createBucketFromR2(bucket) {
    return {
        // prefix：按维度前缀列目录（如 'nether/'、'end/'）；空 = 主世界
        async listTiles(prefix = '') {
            const objects = [];
            let cursor;
            do {
                const opts = {};
                if (prefix) opts.prefix = prefix;
                if (cursor) opts.cursor = cursor;
                const res = await bucket.list(opts);
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