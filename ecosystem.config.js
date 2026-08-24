/**
 * PM2 配置 - 仅部署 Hono 后端 (前端由 IIS 静态托管)
 * Windows Server 使用:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup  (按提示执行)
 *   pm2 logs redon-compress-server
 */
module.exports = {
  apps: [
    {
      name: "redon-compress-server",
      cwd: "./apps/server",
      // 生产: 先 build 再用 node dist/index.js
      // 开发可改成 tsx: script: "npx", args: "tsx src/index.ts"
      script: "dist/index.js",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 6070,
        // 已改为自带 ffmpeg：优先使用 apps/server/bin/ffmpeg.exe (Windows) / bin/ffmpeg (Mac/Linux)
        // 如需强制指定，取消注释：
        // FFMPEG_PATH: "C:\\ffmpeg\\bin\\ffmpeg.exe",
      },
      error_file: "../../logs/server-error.log",
      out_file: "../../logs/server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // 优雅重启
      kill_timeout: 5000,
      wait_ready: false,
    },
  ],
};
