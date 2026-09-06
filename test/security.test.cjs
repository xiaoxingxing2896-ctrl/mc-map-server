const { test } = require('node:test');
const assert = require('node:assert/strict');
const { memoryRateLimit, securityHeaders } = require('../src/security');

function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
test('limiter resets per-client windows and scheduled cleanup', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 });
  const limit = memoryRateLimit({ windowMs: 60000, max: 2, message: 'slow down' });
  let passed = 0;
  const call = ip => { const res = response(); limit({ ip }, res, () => passed++); return res; };
  call('a'); call('a');
  assert.equal(passed, 2);
  const denied = call('a'); assert.equal(denied.statusCode, 429); assert.equal(denied.body.error, 'slow down'); assert.equal(denied.headers['Retry-After'], '60');
  assert.equal(call('b').statusCode, 200);
  t.mock.timers.tick(60001); assert.equal(call('a').statusCode, 200);
  call(undefined); call(undefined); assert.equal(call(undefined).statusCode, 429);
});
test('security headers prohibit framing and object embeds', () => {
  const res = response(); let next = false;
  securityHeaders({}, res, () => { next = true; });
  assert.equal(next, true); assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.match(res.headers['Content-Security-Policy'], /object-src 'none'/);
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});
