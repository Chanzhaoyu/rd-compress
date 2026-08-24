# @redon-compress/web

Vite + React 前端，**独立 IIS 静态部署，无需 PM2**。

- 图片：批量 TinyPNG 风格 + 前端裁剪 (react-image-crop) + 后端 sharp
- 视频：后端 ffmpeg
- `public/web.config` 会在 `build` 后自动复制到 `dist/web.config`，直接将 `dist` 整个目录复制到 IIS 物理路径即可

```bash
# 开发
pnpm --filter @redon-compress/web dev  # http://localhost:6080

# 构建（产物已含 web.config）
pnpm --filter @redon-compress/web build
# 部署：直接复制 apps/web/dist/* 到 IIS，无需额外配置
```
