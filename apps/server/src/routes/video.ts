import { Hono } from "hono";
import { createWriteStream, createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ensureTempDir, tempPath, cleanupFiles } from "../utils/temp.js";
import { runFfmpeg, buildVideoArgs } from "../utils/ffmpeg.js";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_VIDEO_EXT = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_VIDEOS = 2;

let activeJobs = 0;

export const videoRoute = new Hono();

videoRoute.post("/", async (c) => {
  if (activeJobs >= MAX_CONCURRENT_VIDEOS) {
    return c.json({ error: "Server busy, please retry later" }, 429);
  }

  const body = await c.req.parseBody({ all: false });
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing file field 'file'" }, 400);
  }
  if (file.size > MAX_VIDEO_SIZE) {
    return c.json({ error: `File too large, max ${MAX_VIDEO_SIZE / 1024 / 1024}MB` }, 413);
  }

  const originalExt = extname(file.name).toLowerCase() || ".mp4";
  if (!ALLOWED_VIDEO_EXT.includes(originalExt)) {
    return c.json({ error: `Unsupported video type, allowed: ${ALLOWED_VIDEO_EXT.join(", ")}` }, 400);
  }

  const crf = body["crf"] ? Number(body["crf"]) : 28;
  const preset = (body["preset"] as string) || "medium";
  const width = body["width"] ? Number(body["width"]) : undefined;
  const height = body["height"] ? Number(body["height"]) : undefined;
  const fps = body["fps"] ? Number(body["fps"]) : undefined;
  const noAudio = body["noAudio"] === "true" || body["noAudio"] === "1";

  if (Number.isNaN(crf) || crf < 0 || crf > 51) return c.json({ error: "crf must be 0-51" }, 400);
  const validPresets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"];
  if (!validPresets.includes(preset)) return c.json({ error: `preset must be one of ${validPresets.join(",")}` }, 400);
  if (width !== undefined && (Number.isNaN(width) || width < 16 || width > 7680)) return c.json({ error: "width invalid" }, 400);
  if (height !== undefined && (Number.isNaN(height) || height < 16 || height > 4320)) return c.json({ error: "height invalid" }, 400);
  if (fps !== undefined && (Number.isNaN(fps) || fps < 1 || fps > 120)) return c.json({ error: "fps invalid" }, 400);

  const outputExt = ".mp4";
  await ensureTempDir();
  const inputPath = tempPath(originalExt);
  const outputPath = tempPath(outputExt);
  const abort = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => abort.abort(), { once: true });

  activeJobs += 1;
  try {
    const webStream = file.stream();
    await pipeline(Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(inputPath));

    const args = buildVideoArgs({
      input: inputPath,
      output: outputPath,
      crf,
      preset,
      width,
      height,
      fps,
      noAudio,
    });

    await runFfmpeg(args, undefined, { timeoutMs: FFMPEG_TIMEOUT_MS, signal: abort.signal });

    if (!existsSync(outputPath)) {
      await cleanupFiles(inputPath, outputPath);
      return c.json({ error: "Video compress failed: empty output" }, 500);
    }

    const info = await stat(outputPath);
    const originalSize = file.size;
    const compressedSize = info.size;
    const safeName = sanitizeBaseName(file.name);

    c.header("Content-Type", "video/mp4");
    c.header("Content-Length", String(compressedSize));
    c.header("X-Original-Size", String(originalSize));
    c.header("X-Compressed-Size", String(compressedSize));
    c.header("X-Compression-Ratio", ((1 - compressedSize / originalSize) * 100).toFixed(2));
    c.header("Content-Disposition", `attachment; filename="${safeName}-compressed${outputExt}"`);

    const stream = createReadStream(outputPath);
    stream.on("close", () => {
      void cleanupFiles(inputPath, outputPath);
    });
    stream.on("error", () => {
      void cleanupFiles(inputPath, outputPath);
    });
    return c.body(Readable.toWeb(stream) as ReadableStream);
  } catch (e: unknown) {
    await cleanupFiles(inputPath, outputPath);
    const msg = e instanceof Error ? e.message : "Video compress failed";
    console.error("video compress error", e);
    if (msg.toLowerCase().includes("ffmpeg") || msg.toLowerCase().includes("spawn")) {
      return c.json({ error: "ffmpeg failed", hint: "Install ffmpeg or set FFMPEG_PATH / use bundled bin/ffmpeg" }, 500);
    }
    if (msg === "Aborted") {
      return c.json({ error: "Request aborted" }, 400);
    }
    return c.json({ error: "Video compress failed" }, 500);
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
});

videoRoute.get("/presets", (c) => {
  return c.json({
    presets: ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"],
    crf: { min: 0, max: 51, default: 28, note: "越小质量越高，18~28 常用" },
  });
});

function sanitizeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
  return base || "video";
}
