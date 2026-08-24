#!/usr/bin/env node
/**
 * 跨平台自带 ffmpeg 下载脚本
 * - 开发在 Mac (darwin) ，部署在 Windows (win32) -> 需要能一键下载 Windows 版 ffmpeg.exe
 * - 原理：从 ffmpeg-static 的 GitHub Release 直接下载单文件二进制，无需解压
 * - 支持：win32-x64, darwin-x64, darwin-arm64, linux-x64
 *
 * 使用：
 *   node scripts/download-ffmpeg.mjs              # 下载当前平台
 *   node scripts/download-ffmpeg.mjs --win        # 额外下载 Windows 版 (在 Mac 上为部署准备)
 *   node scripts/download-ffmpeg.mjs --all        # 下载所有平台
 *   node scripts/download-ffmpeg.mjs --force      # 强制覆盖
 *
 * 下载后文件位于 apps/server/bin/
 *   bin/ffmpeg.exe          -> Windows (部署用)
 *   bin/ffmpeg              -> Mac/Linux (开发用，arm64/x64 自动选择)
 * 被 .gitignore 忽略，按需提交或随部署产物一起拷贝
 */

import { mkdir, chmod, stat, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "../bin");
const FORCE = process.argv.includes("--force");
const WANT_WIN = process.argv.includes("--win") || process.argv.includes("--all");
const WANT_ALL = process.argv.includes("--all");

// ffmpeg-static 6.1 版本，对应 GitHub Tag b6.0 / b6.1
// 使用 GitHub Release 直接分发单文件二进制，无需解压
const VERSION = "b6.1.1";
const BASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${VERSION}`;

const TARGETS = {
  "win32-x64": { url: `${BASE_URL}/ffmpeg-win32-x64`, out: "ffmpeg.exe" },
  "darwin-x64": { url: `${BASE_URL}/ffmpeg-darwin-x64`, out: "ffmpeg" },
  "darwin-arm64": { url: `${BASE_URL}/ffmpeg-darwin-arm64`, out: "ffmpeg" },
  "linux-x64": { url: `${BASE_URL}/ffmpeg-linux-x64`, out: "ffmpeg" },
  "linux-arm64": { url: `${BASE_URL}/ffmpeg-linux-arm64`, out: "ffmpeg" },
};

// 备用源：ffbinaries (当 GitHub 被墙时)
const FALLBACK_BASE = "https://github.com/ffbinaries/ffbinaries/releases/download/v6.1";

function currentTarget() {
  const platform = process.platform; // darwin, win32, linux
  const arch = process.arch; // x64, arm64
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin") return "darwin-x64";
  if (platform === "win32") return "win32-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  return "linux-x64";
}

async function download(url, dest) {
  console.log(`[ffmpeg] downloading ${url} -> ${dest}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${res.statusText} for ${url}`);
  }
  if (!res.body) throw new Error("No body");
  await pipeline(res.body, createWriteStream(dest));
  // 赋可执行权限
  await chmod(dest, 0o755);
  const s = await stat(dest);
  console.log(`[ffmpeg] done ${(s.size / 1024 / 1024).toFixed(1)}MB`);
}

async function ensureBinDir() {
  await mkdir(BIN_DIR, { recursive: true });
}

async function downloadTarget(key) {
  const t = TARGETS[key];
  if (!t) throw new Error(`Unknown target ${key}`);
  const dest = join(BIN_DIR, t.out);
  // darwin 区分 arch 时避免覆盖冲突：win 固定为 ffmpeg.exe，其他为 ffmpeg
  // 若 --all 模式，darwin-arm64 会覆盖 darwin-x64，这里按需保留两者
  let finalDest = dest;
  if (WANT_ALL && key.startsWith("darwin")) {
    finalDest = join(BIN_DIR, key === "darwin-arm64" ? "ffmpeg-darwin-arm64" : "ffmpeg-darwin-x64");
  }
  if (existsSync(finalDest) && !FORCE) {
    console.log(`[ffmpeg] exists, skip ${finalDest} (use --force to overwrite)`);
    return finalDest;
  }
  try {
    await download(t.url, finalDest);
  } catch (e) {
    console.warn(`[ffmpeg] primary failed for ${key}: ${e.message}, trying fallback...`);
    // ffbinaries fallback 尝试
    const fallbackMap = {
      "win32-x64": `${FALLBACK_BASE}/ffmpeg-6.1-win-64.zip`,
      "darwin-x64": `${FALLBACK_BASE}/ffmpeg-6.1-osx-64.zip`,
    };
    if (fallbackMap[key]) {
      console.log(`[ffmpeg] fallback not implemented for zip, please manually download. Use: ${fallbackMap[key]}`);
    }
    throw e;
  }
  return finalDest;
}

async function main() {
  await ensureBinDir();

  const tasks = [];
  const cur = currentTarget();

  if (WANT_ALL) {
    for (const k of Object.keys(TARGETS)) tasks.push(k);
  } else {
    tasks.push(cur);
    if (WANT_WIN && cur !== "win32-x64") tasks.push("win32-x64");
  }

  console.log(`[ffmpeg] bin dir: ${BIN_DIR}`);
  console.log(`[ffmpeg] targets: ${tasks.join(", ")}`);

  for (const k of tasks) {
    try {
      await downloadTarget(k);
    } catch (e) {
      console.error(`[ffmpeg] failed ${k}: ${e.message}`);
      if (!WANT_ALL) process.exitCode = 1;
    }
  }

  console.log(`
[ffmpeg] 完成！
- Mac 开发：直接使用 bin/ffmpeg (arm64/x64 自动) 或 brew 安装的 ffmpeg
- Windows 部署：将 bin/ffmpeg.exe 随 apps/server 一起部署，服务端会自动优先使用
- 验证：ls -lh ${BIN_DIR}
- 健康检查：curl http://localhost:6070/api/health 会显示当前使用的 ffmpeg 路径
  `);
}

main();
