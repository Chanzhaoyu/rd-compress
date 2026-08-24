import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export function checkFfmpeg(): { ok: boolean; path: string } {
  // Windows: ffmpeg.exe should be in PATH or alongside
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  return { ok: true, path: ffmpeg };
}

export interface FfmpegProgress {
  percent?: number;
  timemark?: string;
}

export function runFfmpeg(
  args: string[],
  onProgress?: (p: FfmpegProgress) => void
): Promise<void> {
  const { path } = checkFfmpeg();
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
