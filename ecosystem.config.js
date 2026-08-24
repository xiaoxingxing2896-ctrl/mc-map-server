// PM2 直接运行（不使用 Docker 时的备选方案）
module.exports = {
  apps: [{
    name: 'mc-map-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};