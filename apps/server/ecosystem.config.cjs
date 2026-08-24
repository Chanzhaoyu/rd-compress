/**
 * PM2 配置 - 仅 API (Hono) 使用
 * 部署方式：单独复制 apps/server 目录到 Windows Server 后，在该目录内执行
 *
 *   pnpm install        # 或 npm install
 *   pnpm build          # tsc -> dist/
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup
 *   pm2 logs redon-compress-server
 *
 * 前端 web 不需要 PM2，直接将 apps/web/dist 复制到 IIS 静态站点即可
 */
module.exports = {
  apps: [
    {
      name: "redon-compress-server",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 6070,
        // 已改为自带 ffmpeg：优先使用 ./bin/ffmpeg.exe (Windows) / ./bin/ffmpeg (Mac/Linux)
        // 如需强制指定，取消注释：
        // FFMPEG_PATH: "C:\\ffmpeg\\bin\\ffmpeg.exe",
      },
      error_file: "./logs/server-error.log",
      out_file: "./logs/server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      kill_timeout: 5000,
      wait_ready: false,
    },
  ],
};
