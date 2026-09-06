import assert from 'node:assert/strict';
import { tokens } from './helpers.mjs';

// Shared behavioral contracts; each case receives a new database and rate limit state.
export function apiContract(test, fixture) {
  const cases = {
    async 'health, JSON 404 and security headers'({ req }) {
      const r = await req('GET', '/api/health');
      assert.equal(r.status, 200); assert.equal(r.data.ok, true);
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
      const missing = await req('GET', '/api/no-such-route');
      assert.equal(missing.status, 404); assert.equal(missing.data.error, 'Not Found');
    },
    async 'missing, invalid and valid authentication'({ req }) {
      assert.equal((await req('GET', '/api/me')).status, 401);
      assert.equal((await req('GET', '/api/me', undefined, 'bad')).status, 403);
      const r = await req('GET', '/api/me', undefined, tokens.alice);
      assert.equal(r.status, 200); assert.equal(r.data.username, 'alice');
    },
    async 'user listing hides hashes and requires a privileged role'({ req }) {
      assert.equal((await req('GET', '/api/users')).status, 401);
      assert.equal((await req('GET', '/api/users', undefined, tokens.alice)).status, 403);
      for (const token of [tokens.admin, tokens.owner]) {
        const r = await req('GET', '/api/users', undefined, token);
        assert.equal(r.status, 200); assert.equal(r.data.length, 4);
        assert.ok(r.data.every(u => !('password_hash' in u)));
      }
    },
    async 'role validation and target restrictions'({ req }) {
      for (const [id, role, token, status] of [
        [3, 'root', tokens.owner, 400], [999, 'user', tokens.owner, 404],
        [1, 'user', tokens.owner, 403], [1, 'user', tokens.admin, 403],
        [2, 'user', tokens.admin, 403], [4, 'admin', tokens.alice, 403],
      ]) assert.equal((await req('PUT', `/api/users/${id}/role`, { role }, token)).status, status);
    },
    async 'admin cannot grant owner privileges'({ req, db }) {
      assert.equal((await req('PUT', '/api/users/4/role', { role: 'owner' }, tokens.admin)).status, 403);
      assert.equal((await db.get('SELECT role FROM users WHERE id = 4')).role, 'user');
    },
    async 'owner can promote and demote another user'({ req, db }) {
      for (const role of ['admin', 'user']) {
        assert.equal((await req('PUT', '/api/users/4/role', { role }, tokens.owner)).status, 200);
        assert.equal((await db.get('SELECT role FROM users WHERE id = 4')).role, role);
      }
    },
    async 'tile filename formats, negative coordinates and ignored files'({ req }) {
      const r = await req('GET', '/api/tiles');
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.map(t => [t.x, t.z]).sort(), [[-10, 20], [-2048, 0], [0, 0]].sort());
    },
    async 'tile bytes, cache lifetime and missing objects'({ req }) {
      const r = await req('GET', '/tiles/x-10z20.png');
      assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /max-age=604800/);
      assert.match(r.headers.get('content-type'), /image\/png/);
      assert.equal((await req('GET', '/tiles/missing.png')).status, 404);
    },
    async 'anonymous writes are rejected'({ req }) {
      for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await req(method, '/api/markers' + (method === 'POST' ? '' : '/1'), method === 'DELETE' ? undefined : {})).status, 401);
    },
    async 'marker create trims title and preserves zero and negative coordinates'({ req }) {
      const r = await req('POST', '/api/markers', { title: '  出生点  ', x: 0, z: '-12', icon: '🏠', isPublic: true }, tokens.alice);
      assert.equal(r.status, 200);
      assert.equal(r.data.title, '出生点'); assert.equal(r.data.x, 0); assert.equal(r.data.z, -12);
      assert.equal(r.data.created_by, 'alice'); assert.equal(r.data.icon, '🏠');
      assert.equal(r.data.category, 'other'); assert.equal(r.data.is_public, 1);
      assert.equal((await req('GET', `/api/markers/${r.data.id}`)).status, 200);
    },
    async 'blank and nonstring titles are rejected without inserting'({ req, db }) {
      for (const title of ['', '  ', null, 4, {}]) assert.equal((await req('POST', '/api/markers', { title, x: 1, z: 1 }, tokens.alice)).status, 400);
      assert.equal((await db.get('SELECT COUNT(*) AS c FROM markers')).c, 0);
    },
    async 'invalid coordinates cannot be coerced into locations'({ req, db }) {
      for (const x of ['', ' ', null, true, false, [], [1], {}, 1.5, 'abc']) {
        assert.equal((await req('POST', '/api/markers', { title: 'bad', x, z: 1 }, tokens.alice)).status, 400, JSON.stringify(x));
      }
      assert.equal((await db.get('SELECT COUNT(*) AS c FROM markers')).c, 0);
    },
    async 'public and private list visibility including invalid optional token'({ req }) {
      await req('POST', '/api/markers', { title: 'public', x: 1, z: 2, isPublic: true }, tokens.alice);
      await req('POST', '/api/markers', { title: 'private', x: 3, z: 4, isPublic: false }, tokens.alice);
      for (const token of [undefined, 'bad', tokens.bob, tokens.admin]) {
        const r = await req('GET', '/api/markers', undefined, token);
        assert.equal(r.status, 200); assert.deepEqual(r.data.map(m => m.title), ['public']);
      }
      assert.equal((await req('GET', '/api/markers', undefined, tokens.alice)).data.length, 2);
    },
    async 'private details obey the same visibility as the list'({ req }) {
      const r = await req('POST', '/api/markers', { title: 'secret', x: 1, z: 2 }, tokens.alice);
      for (const token of [undefined, 'bad', tokens.bob, tokens.admin, tokens.owner]) {
        const detail = await req('GET', `/api/markers/${r.data.id}`, undefined, token);
        assert.equal(detail.status, 404); assert.equal(detail.data.title, undefined);
      }
      assert.equal((await req('GET', `/api/markers/${r.data.id}`, undefined, tokens.alice)).status, 200);
    },
    async 'marker ownership restricts edits and deletes'({ req }) {
      const r = await req('POST', '/api/markers', { title: 'original', x: 1, z: 2 }, tokens.alice);
      const url = `/api/markers/${r.data.id}`;
      assert.equal((await req('PUT', url, { title: 'stolen' }, tokens.bob)).status, 403);
      assert.equal((await req('DELETE', url, undefined, tokens.bob)).status, 403);
      assert.equal((await req('GET', url, undefined, tokens.alice)).data.title, 'original');
      for (const token of [tokens.alice, tokens.admin, tokens.owner]) assert.equal((await req('PUT', url, { title: 'allowed' }, token)).status, 200);
      assert.equal((await req('DELETE', url, undefined, tokens.admin)).status, 200);
      assert.equal((await req('GET', url)).status, 404);
    },
    async 'partial updates preserve omitted fields and allow explicit false and zero'({ req }) {
      const r = await req('POST', '/api/markers', { title: 'original', x: 9, z: 8, category: 'farm', icon: '🌾', isPublic: true }, tokens.alice);
      const url = `/api/markers/${r.data.id}`;
      const updated = await req('PUT', url, { title: ' updated ' }, tokens.alice);
      assert.equal(updated.status, 200); assert.equal(updated.data.category, 'farm');
      assert.equal(updated.data.is_public, 1); assert.equal(updated.data.icon, '🌾');
      const explicit = await req('PUT', url, { x: 0, z: 0, isPublic: false, description: '' }, tokens.alice);
      assert.equal(explicit.data.x, 0); assert.equal(explicit.data.z, 0); assert.equal(explicit.data.is_public, 0);
    },
    async 'invalid updates leave existing marker intact'({ req }) {
      const r = await req('POST', '/api/markers', { title: 'original', x: 1, z: 2, icon: '⭐' }, tokens.alice);
      const url = `/api/markers/${r.data.id}`;
      for (const body of [{ title: '' }, { title: 3 }, { x: 1.2 }, { z: null }]) assert.equal((await req('PUT', url, body, tokens.alice)).status, 400);
      const updated = await req('PUT', url, { icon: 'toolong' }, tokens.alice);
      assert.equal(updated.data.title, 'original'); assert.equal(updated.data.icon, '⭐');
    },
    async 'missing markers return 404 for read, edit and delete'({ req }) {
      for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await req(method, '/api/markers/999', method === 'PUT' ? {} : undefined, tokens.alice)).status, 404);
    },
  };
  for (const [name, run] of Object.entries(cases)) test(name, async t => run(await fixture(t)));
}
