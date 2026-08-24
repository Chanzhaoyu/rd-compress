# @redon-compress/server

Hono 后端 - 图片/视频压缩，文件用完即删，适合 Windows Server + PM2。

## 开发

```bash
pnpm install
pnpm --filter @redon-compress/server dev  # http://localhost:6070
```

## 单独部署 (Windows Server) - 仅复制本目录

```bash
# 1. 将 apps/server 整个目录复制到服务器，例如 C:\redon-compress-server\
# 2. 在服务器该目录内执行：
pnpm install          # 或 npm install
pnpm download:ffmpeg:win  # 可选，预下载 Windows 版 ffmpeg.exe 到 bin/
pnpm build            # tsc -> dist/
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
pm2 logs redon-compress-server
# ecosystem.config.cjs 已在 apps/server 内，仅 API 需要；Web 端无需 PM2
```

### 前置依赖

- Node.js 18+ / 20+
- ffmpeg：已改为自带 `bin/ffmpeg.exe`（`pnpm download:ffmpeg:win`），也可手动下载到 PATH 或设 `FFMPEG_PATH`
- sharp: pnpm 会自动下载 prebuilt，无需编译

### IIS 反向代理 (可选)

若需通过 IIS 同域代理 API，可用 `ARR + URL Rewrite` 将 `/api/*` 代理到 `http://localhost:6070`，Web 的 `public/web.config` 已预留注释。

## API

- `GET /api/health`
- `POST /api/compress/image` multipart: `file` + `quality(1-100)` + `format(jpeg|png|webp|avif|keep)` + `width` + `height`
- `POST /api/compress/video` multipart: `file` + `crf(0-51)` + `preset` + `width` + `height` + `fps` + `noAudio`
