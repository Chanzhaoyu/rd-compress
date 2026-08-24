# @rd-compress/web

Vite + React 前端，IIS 静态部署。

- 图片：前端裁剪 (react-image-crop) + 后端 sharp 压缩
- 视频：后端 ffmpeg 压缩
- 构建后 `dist` 直接丢 IIS

```
pnpm --filter @rd-compress/web dev
pnpm --filter @rd-compress/web build
```
