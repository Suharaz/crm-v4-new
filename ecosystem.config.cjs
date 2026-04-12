// PM2 ecosystem config for production
// Usage: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'crm-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3010,
      },
      max_memory_restart: '512M',
    },
    {
      name: 'crm-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3011,
      },
      max_memory_restart: '512M',
    },
  ],
};
