# Redon Compress - 内部图片/视频压缩工具站

> Vite+React (IIS 静态) + Hono (PM2) · 文件不落地，用完即删 · 可扩展编辑/裁剪

## 结构

```
redon-compress/
  apps/web      # Vite+React 前端 -> IIS
  apps/server   # Hono 后端 -> PM2
  ecosystem.config.js  # PM2 仅后端
  web.config    # IIS SPA 回退 + API 代理示例
```

## 快速开始

```bash
pnpm install

# 开发 (需两终端)
pnpm --filter @redon-compress/server dev   # http://localhost:6070
pnpm --filter @redon-compress/web dev      # http://localhost:6080 (代理 /api 到 6070)

# 构建
pnpm build
```

## 部署

### 前端 - IIS 静态

1. `pnpm --filter @redon-compress/web build`
2. 将 `apps/web/dist` 内容复制到 IIS 站点目录
3. 将 `web.config` 放到站点根目录 (已处理 SPA 回退)
4. (可选) 安装 `ARR + URL Rewrite`，取消 `web.config` 中 API 代理注释，实现同域 `/api -> localhost:6070` 免 CORS

或配置前端 `apps/web/.env.production`:
```
VITE_API_BASE_URL=http://10.x.x.x:6070
```

### 后端 - Windows Server + PM2

**ffmpeg 已改为环境自带，无需手动安装到 PATH：**

```bash
# 在 Mac 开发机上，也能一键下载 Windows 版 ffmpeg.exe (约 80MB)
pnpm --filter @redon-compress/server download:ffmpeg:win
# 或下载所有平台
pnpm --filter @redon-compress/server download:ffmpeg:all
# 验证 bin/ffmpeg.exe 已生成，提交或随部署产物拷贝
ls -lh apps/server/bin/
```

优先级：`FFMPEG_PATH` 环境变量 > `apps/server/bin/ffmpeg.exe` (Windows) / `bin/ffmpeg` (Mac/Linux) > 系统 `PATH`

**部署 (Windows Server):**
```powershell
# 方式1：自带二进制（推荐）
# 将含 bin/ffmpeg.exe 的 apps/server 目录整体拷贝到服务器
pnpm --filter @redon-compress/server build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # 按提示执行开机自启
pm2 logs redon-compress-server

# 方式2：传统 PATH 方式（仍兼容）
# 手动安装 ffmpeg 到 C:\ffmpeg 并设 FFMPEG_PATH
```

健康检查: `GET http://localhost:6070/api/health`

## API

- `POST /api/compress/image` multipart: `file, quality(1-100), format(jpeg|png|webp|avif|keep), width, height` -> 直接返回压缩后文件流
- `POST /api/compress/video` multipart: `file, crf(0-51), preset(medium), width, height, fps, noAudio` -> 返回 mp4
- 头信息返回 `X-Original-Size / X-Compressed-Size / X-Compression-Ratio` 供前端展示

## 扩展预留

- 图片裁剪已接入 `react-image-crop`，裁剪在前端 Canvas 完成后再上传
- 后续滤镜/水印/标注：前端 `Canvas Pipeline` 插件化，新增插件即可
- 视频扩展：可在 `src/utils/ffmpeg.ts:buildVideoArgs` 新增参数透传
