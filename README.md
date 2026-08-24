# RD Compress - 内部图片/视频压缩工具站

> Vite+React (IIS 静态) + Hono (PM2) · 文件不落地，用完即删 · 可扩展编辑/裁剪

## 结构

```
rd-compress/
  apps/web      # Vite+React 前端 -> IIS
  apps/server   # Hono 后端 -> PM2
  ecosystem.config.js  # PM2 仅后端
  web.config    # IIS SPA 回退 + API 代理示例
```

## 快速开始

```bash
pnpm install

# 开发 (需两终端)
pnpm --filter @rd-compress/server dev   # http://localhost:3000
pnpm --filter @rd-compress/web dev      # http://localhost:5173 (代理 /api 到 3000)

# 构建
pnpm build
```

## 部署

### 前端 - IIS 静态

1. `pnpm --filter @rd-compress/web build`
2. 将 `apps/web/dist` 内容复制到 IIS 站点目录
3. 将 `web.config` 放到站点根目录 (已处理 SPA 回退)
4. (可选) 安装 `ARR + URL Rewrite`，取消 `web.config` 中 API 代理注释，实现同域 `/api -> localhost:3000` 免 CORS

或配置前端 `apps/web/.env.production`:
```
VITE_API_BASE_URL=http://10.x.x.x:3000
```

### 后端 - Windows Server + PM2

前置: 安装 `ffmpeg` 并加入 PATH，或设 `FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe`

```powershell
pnpm --filter @rd-compress/server build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # 按提示执行开机自启
pm2 logs rd-compress-server
```

健康检查: `GET http://localhost:3000/api/health`

## API

- `POST /api/compress/image` multipart: `file, quality(1-100), format(jpeg|png|webp|avif|keep), width, height` -> 直接返回压缩后文件流
- `POST /api/compress/video` multipart: `file, crf(0-51), preset(medium), width, height, fps, noAudio` -> 返回 mp4
- 头信息返回 `X-Original-Size / X-Compressed-Size / X-Compression-Ratio` 供前端展示

## 扩展预留

- 图片裁剪已接入 `react-image-crop`，裁剪在前端 Canvas 完成后再上传
- 后续滤镜/水印/标注：前端 `Canvas Pipeline` 插件化，新增插件即可
- 视频扩展：可在 `src/utils/ffmpeg.ts:buildVideoArgs` 新增参数透传
