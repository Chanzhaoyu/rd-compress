# Redon Compress - 内部图片/视频压缩工具站

> Vite+React (IIS 静态) + Hono (PM2) · 处理完删除临时文件，不持久化 · 可扩展编辑/裁剪

## 结构

```
redon-compress/
  apps/web              # Vite+React 前端 -> IIS (仅 dist)
    public/web.config   # IIS 配置，build 后自动到 dist/web.config
    dist/               # 直接复制到 IIS 即可
  apps/server           # Hono 后端 -> PM2 (独立部署)
    ecosystem.config.cjs # 仅 API 需要，Web 不需要 PM2
    bin/ffmpeg.exe      # 自带 ffmpeg
```

> 分开部署：`web` 与 `api` 完全独立，`ecosystem.config.cjs` 仅 `api` 使用。

## 快速开始

```bash
pnpm install

# 开发 (需两终端)
pnpm --filter @redon-compress/server dev   # http://localhost:6070
pnpm --filter @redon-compress/web dev      # http://localhost:6080 (代理 /api 到 6070)

# 构建
pnpm build
```

## 部署（分开部署）

### 1. Web 端 - IIS 静态（仅复制 dist）

```bash
# 本地/CI 构建
pnpm --filter @redon-compress/web build
# 产物：apps/web/dist/ 已包含 index.html + assets + web.config (来自 public/web.config)
```
- 将 `apps/web/dist` **整个文件夹内容**直接复制到 IIS 站点物理路径即可，无需额外 `web.config` 操作（已内置 SPA 回退）。
- 如需同域代理 API，编辑 `dist/web.config` 取消 `Proxy API to Hono` 注释（需安装 ARR + URL Rewrite）；否则配置 `apps/web/.env.production`：
  ```
  VITE_API_BASE_URL=http://10.x.x.x:6070
  ```

### 2. API 端 - Windows Server + PM2（仅 server 目录）

**ffmpeg 已改为环境自带，无需手动安装到 PATH：**

```bash
# 在 Mac 开发机上，也能一键下载 Windows 版 ffmpeg.exe (约 80MB)
pnpm --filter @redon-compress/server download:ffmpeg:win
ls -lh apps/server/bin/  # 确认 ffmpeg.exe 已生成
```

**服务器上单独部署（复制 apps/server 目录后）：**
```powershell
# 将 apps/server 目录完整复制到服务器，例如 C:\redon-compress-server\
cd C:\redon-compress-server

# 1. 安装依赖
pnpm install
# 或 npm install

# 2. 构建
pnpm build        # tsc -> dist/

# 3. PM2 启动（使用 server 目录内的 ecosystem.config.cjs，仅 API 需要）
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
pm2 logs redon-compress-server
```

> `ecosystem.config.cjs` 已内置于 `apps/server/`，`web` 端完全不需要 PM2。

健康检查: `GET http://localhost:6070/api/health`

## API

- `POST /api/compress/image` multipart: `file, quality(1-100), format(jpeg|png|webp|avif|keep), width, height` -> 直接返回压缩后文件流
- `POST /api/compress/video` multipart: `file, crf(0-51), preset(medium), width, height, fps, noAudio` -> 返回 mp4
- 头信息返回 `X-Original-Size / X-Compressed-Size / X-Compression-Ratio` 供前端展示

## 扩展预留

- 图片裁剪已接入 `react-image-crop`，裁剪在前端 Canvas 完成后再上传
- 后续滤镜/水印/标注：前端 `Canvas Pipeline` 插件化，新增插件即可
- 视频扩展：可在 `src/utils/ffmpeg.ts:buildVideoArgs` 新增参数透传
