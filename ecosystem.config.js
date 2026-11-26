// PM2 ecosystem configuration for TelegramControlPanel
// Usage:
//   pm2 start ecosystem.config.js        → start all processes
//   pm2 stop ecosystem.config.js         → stop all processes
//   pm2 restart ecosystem.config.js      → restart all processes
//   pm2 logs                             → tail all logs
//   pm2 monit                            → live process monitor
//   pm2 save                             → persist process list across reboots
//   pm2 startup                          → configure auto-start on server boot

// Read WEB_HOST / WEB_PORT from .env. Default host is 127.0.0.1 so the panel is only reachable
// through the reverse proxy (nginx + HTTPS). Set WEB_HOST=0.0.0.0 to expose it directly.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const WEB_HOST = process.env.WEB_HOST || '127.0.0.1';
const WEB_PORT = process.env.WEB_PORT || '4567';

module.exports = {
  apps: [
    // ── Web Server ──────────────────────────────────────────────────────────
    {
      name: 'tcp-web',
      script: 'node_modules/.bin/next',
      args: `start -p ${WEB_PORT} -H ${WEB_HOST}`,
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
      // Log files
      out_file: './logs/web-out.log',
      error_file: './logs/web-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ── Background Job Worker ───────────────────────────────────────────────
    {
      name: 'tcp-worker',
      script: 'node_modules/.bin/ts-node',
      args: '--project tsconfig.scripts.json scripts/worker.ts',
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      // Restart with exponential backoff on crash
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
      // Log files
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
