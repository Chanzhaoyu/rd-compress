import { spawn, type ChildProcess } from "node:child_process";
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

function killProcess(proc: ChildProcess) {
  if (!proc.pid || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { stdio: "ignore" });
    } else {
      proc.kill("SIGKILL");
    }
  } catch {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }
}

export async function checkFfmpeg(): Promise<{ ok: boolean; path: string; bundled: boolean; version?: string }> {
  const resolved = resolveBundledFfmpeg();
  const p = getFfmpegPath();
  const bundled = !!resolved && resolved !== process.env.FFMPEG_PATH;

  return new Promise((resolve) => {
    const proc = spawn(p, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => {
      killProcess(proc);
      resolve({ ok: false, path: p, bundled });
    }, 4000);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, path: p, bundled });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const version = stdout.split("\n")[0]?.trim();
        resolve({ ok: true, path: p, bundled, version });
      } else {
        resolve({ ok: false, path: p, bundled });
      }
    });
  });
}

export interface FfmpegProgress {
  percent?: number;
  timemark?: string;
}

export function runFfmpeg(
  args: string[],
  onProgress?: (p: FfmpegProgress) => void,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<void> {
  const path = getFfmpegPath();
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const proc = spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      killProcess(proc);
      finish(new Error("Aborted"));
    };

    const timer = setTimeout(() => {
      killProcess(proc);
      finish(new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    options?.signal?.addEventListener("abort", onAbort, { once: true });

    proc.stderr.on("data", (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
      if (onProgress) {
        const timeMatch = str.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) onProgress({ timemark: timeMatch[1] });
      }
    });

    proc.on("error", (err) => {
      finish(new Error(`Failed to spawn ffmpeg: ${err.message}. Ensure ffmpeg is installed and in PATH (Windows: ffmpeg.exe).`));
    });

    proc.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
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

  const vf = buildScaleFilter(width, height);
  if (vf) args.push("-vf", vf);
  if (fps) {
    args.push("-r", String(fps));
  }

  args.push("-c:v", "libx264", "-crf", String(crf), "-preset", preset, "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (noAudio) args.push("-an");
  else args.push("-c:a", "aac", "-b:a", "128k");

  args.push(output);
  return args;
}

/** 保持比例、不放大、输出偶数边长（libx264 要求） */
function buildScaleFilter(width?: number, height?: number): string | undefined {
  if (!width && !height) return undefined;
  const even = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  if (width && height) {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,${even}`;
  }
  if (width) return `scale='min(iw,${width})':-2`;
  return `scale=-2:'min(ih,${height})'`;
}
