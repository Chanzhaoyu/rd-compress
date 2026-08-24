/**
 * PM2 配置 - 仅 API 需要（monorepo 根目录便捷启动）
 * 实际分开部署时，API 请使用 apps/server/ecosystem.config.js
 * Web 直接将 apps/web/dist 复制到 IIS，无需 PM2
 *
 * 根目录启动（开发/一体化部署）：
 *   pm2 start ecosystem.config.js --env production
 * 分开部署（推荐）：
 *   复制 apps/server 到服务器后，在该目录内 pm2 start ecosystem.config.js
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
