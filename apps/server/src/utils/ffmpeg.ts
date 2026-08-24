import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function resolveBundledFfmpeg(): string | null {
  // 优先级：FFMPEG_PATH > 自带 bin > PATH
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (process.env.FFMPEG_PATH) {
    // 允许用户设为 "ffmpeg" 走 PATH
    if (process.env.FFMPEG_PATH === "ffmpeg") return null;
    return process.env.FFMPEG_PATH;
  }

  // 尝试自带 bin：兼容 dev (src/utils) 和 prod (dist/utils) 两种运行路径
  // 以及 Windows Server 上 cwd 可能不同
  const isWin = process.platform === "win32";
  const exeName = isWin ? "ffmpeg.exe" : "ffmpeg";

  // import.meta.url 在 ESM 中可用，fallback 到 cwd
  let baseDir: string | null = null;
  try {
    baseDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    baseDir = null;
  }

  const candidates: string[] = [];
  if (baseDir) {
    candidates.push(join(baseDir, "../../bin", exeName)); // dist/utils -> bin
    candidates.push(join(baseDir, "../bin", exeName)); // src/utils -> bin (tsx watch)
    candidates.push(join(baseDir, "../../../apps/server/bin", exeName)); // monorepo root fallback
  }
  candidates.push(join(process.cwd(), "bin", exeName));
  candidates.push(join(process.cwd(), "apps/server/bin", exeName));
  // pm2 cwd 为 apps/server 时 process.cwd() 已是该目录，上面的已覆盖
  // 额外尝试 __dirname 风格的绝对路径（Windows 常见）
  if (process.env.PM2_HOME) {
    // pm2 环境不特殊处理，仍走 candidates
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getFfmpegPath(): string {
  const bundled = resolveBundledFfmpeg();
  if (bundled) return bundled;
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function checkFfmpeg(): { ok: boolean; path: string; bundled: boolean } {
  const p = getFfmpegPath();
  const bundled = p !== "ffmpeg" && p !== process.env.FFMPEG_PATH;
  // 即使 bundled 为 null，最终也会用 "ffmpeg" 走 PATH，这里只做存在性检查供 health 用
  const exists = p === "ffmpeg" ? true : existsSync(p);
  return { ok: exists, path: p, bundled };
}

export interface FfmpegProgress {
  percent?: number;
  timemark?: string;
}

export function runFfmpeg(
  args: string[],
  onProgress?: (p: FfmpegProgress) => void
): Promise<void> {
  const path = getFfmpegPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      // parse time=00:00:01.23
      if (onProgress) {
        const timeMatch = str.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) onProgress({ timemark: timeMatch[1] });
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}. Ensure ffmpeg is installed and in PATH (Windows: ffmpeg.exe).`));
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export function buildVideoArgs(opts: {
  input: string;
  output: string;
  crf?: number;
  preset?: string;
  width?: number;
  height?: number;
  fps?: number;
  noAudio?: boolean;
}): string[] {
  const { input, output, crf = 28, preset = "medium", width, height, fps, noAudio } = opts;
  const args: string[] = ["-y", "-i", input];

  // scale if needed, keep aspect ratio
  if (width || height) {
    const w = width || -2;
    const h = height || -2;
    // -2 means keep aspect and divisible by 2
    args.push("-vf", `scale=${w}:${h}`);
  }
  if (fps) {
    args.push("-r", String(fps));
  }

  args.push("-c:v", "libx264", "-crf", String(crf), "-preset", preset, "-pix_fmt", "yuv420p");
  if (noAudio) args.push("-an");
  else args.push("-c:a", "aac", "-b:a", "128k");

  args.push(output);
  return args;
}
