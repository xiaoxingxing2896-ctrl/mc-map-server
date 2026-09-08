const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
module.exports = function createTileStorage(root) {
  function resolve(key) {
    const target = path.resolve(root, key);
    if (!target.startsWith(path.resolve(root) + path.sep) || key.includes('..') || key.includes('\\')) throw new Error('Invalid tile path');
    return target;
  }
  const etag = bytes => createHash('sha256').update(bytes).digest('hex');
  async function headTile(key) {
    try { return { etag: etag(await fs.readFile(resolve(key))) }; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  return {
    headTile,
    async listTiles(prefix = '') {
      const base = prefix ? resolve(prefix) : path.resolve(root);
      let entries;
      try { entries = await fs.readdir(base, { withFileTypes: true }); }
      catch (e) { if (e.code === 'ENOENT') return []; throw e; }
      return Promise.all(entries.filter(e => e.isFile() && !e.name.endsWith('.lock') && !e.name.endsWith('.tmp')).map(async e => {
        const key = prefix + e.name;
        // Hash only overlays; repository indices keep the legacy response shape.
        if (prefix.startsWith('_uploads/')) return { key, ...await headTile(key) };
        return { key };
      }));
    },
    async getTile(key) {
      try { return { buf: await fs.readFile(resolve(key)), type: key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }; }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async putTile(key, bytes, expected) {
      const target = resolve(key); await fs.mkdir(path.dirname(target), { recursive: true });
      let lock;
      try { lock = await fs.open(target + '.lock', 'wx'); }
      catch (e) { if (e.code === 'EEXIST') return null; throw e; }
      const temp = target + '.' + randomUUID() + '.tmp';
      try {
        const current = await headTile(key);
        if ((current?.etag || null) !== expected) return null;
        await fs.writeFile(temp, bytes, { flag: 'wx' });
        await fs.rename(temp, target);
        return { etag: etag(bytes) };
      } finally {
        await fs.rm(temp, { force: true }); await lock.close(); await fs.unlink(target + '.lock');
      }
    },
  };
};
