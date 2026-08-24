# bin - ffmpeg 自带二进制

- `ffmpeg.exe` Windows 版 (部署到 Windows Server 用)
- `ffmpeg` Mac/Linux 版 (开发用)

下载方式（在 Mac 上也能下载 Windows 版）：

```bash
# 仅当前平台
node scripts/download-ffmpeg.mjs

# Mac 上额外下载 Windows 版（为部署准备）
node scripts/download-ffmpeg.mjs --win

# 下载所有平台
node scripts/download-ffmpeg.mjs --all

# 强制覆盖
node scripts/download-ffmpeg.mjs --win --force
```

服务端优先级：`FFMPEG_PATH` 环境变量 > `bin/ffmpeg.exe` / `bin/ffmpeg` (自带) > 系统 `PATH` 中的 `ffmpeg`。

`.gitignore` 默认忽略二进制，按需 `git add -f apps/server/bin/ffmpeg.exe` 提交，或在 CI 中执行下载后随产物部署。
