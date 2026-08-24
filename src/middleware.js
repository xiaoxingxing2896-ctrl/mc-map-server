/**
 * 认证 / 授权中间件（逻辑与原 server.js 完全一致）。
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未提供 Token' });
  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token 无效' });
    req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, config.jwtSecret, (err, user) => {
    req.user = err ? null : user;
    next();
  });
}

module.exports = { authenticate, requireRole, optionalAuth };