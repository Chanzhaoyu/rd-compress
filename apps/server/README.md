# @rd-compress/server

Hono 后端 - 图片/视频压缩，文件用完即删，适合 Windows Server + PM2。

## 开发

```bash
pnpm install
pnpm --filter @rd-compress/server dev  # http://localhost:3000
```

## 构建/部署 (Windows Server)

```bash
pnpm --filter @rd-compress/server build
# 确保 dist/index.js 存在
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 前置依赖

- Node.js 18+ / 20+
- ffmpeg: 下载 https://ffmpeg.org/download.html Windows 版，解压后将 bin 加入 PATH，或设置环境变量 `FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe`
- sharp: pnpm 会自动下载 prebuilt，无需编译

### IIS 反向代理 (可选)

若需通过 IIS 对外暴露后端，可用 `ARR + URL Rewrite` 将 `/api/*` 代理到 `http://localhost:3000`，前端静态站同域避免 CORS。

## API

- `GET /api/health`
- `POST /api/compress/image` multipart: `file` + `quality(1-100)` + `format(jpeg|png|webp|avif|keep)` + `width` + `height`
- `POST /api/compress/video` multipart: `file` + `crf(0-51)` + `preset` + `width` + `height` + `fps` + `noAudio`
