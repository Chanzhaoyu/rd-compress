import { Hono } from "hono";
import { writeFile, readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { ensureTempDir, tempPath, cleanupFiles } from "../utils/temp.js";
import { runFfmpeg, buildVideoArgs } from "../utils/ffmpeg.js";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_VIDEO_EXT = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];

export const videoRoute = new Hono();

// POST /api/compress/video
// multipart/form-data: file, crf(0-51), preset, width, height, fps, noAudio
videoRoute.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing file field 'file'" }, 400);
  }
  if (file.size > MAX_VIDEO_SIZE) {
    return c.json({ error: `File too large, max ${MAX_VIDEO_SIZE / 1024 / 1024}MB` }, 413);
  }

  const crf = body["crf"] ? Number(body["crf"]) : 28;
  const preset = (body["preset"] as string) || "medium";
  const width = body["width"] ? Number(body["width"]) : undefined;
  const height = body["height"] ? Number(body["height"]) : undefined;
  const fps = body["fps"] ? Number(body["fps"]) : undefined;
  const noAudio = body["noAudio"] === "true" || body["noAudio"] === "1";

  if (isNaN(crf) || crf < 0 || crf > 51) return c.json({ error: "crf must be 0-51" }, 400);
  const validPresets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"];
  if (!validPresets.includes(preset)) return c.json({ error: `preset must be one of ${validPresets.join(",")}` }, 400);

  const originalExt = extname(file.name).toLowerCase() || ".mp4";
  // We always output mp4 for max compatibility
  const outputExt = ".mp4";

  await ensureTempDir();
  const inputPath = tempPath(originalExt);
  const outputPath = tempPath(outputExt);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

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

    await runFfmpeg(args);

    const data = await readFile(outputPath);
    const originalSize = file.size;
    const compressedSize = data.length;

    c.header("Content-Type", "video/mp4");
    c.header("Content-Length", String(data.length));
    c.header("X-Original-Size", String(originalSize));
    c.header("X-Compressed-Size", String(compressedSize));
    c.header("X-Compression-Ratio", ((1 - compressedSize / originalSize) * 100).toFixed(2));
    c.header("Content-Disposition", `attachment; filename="compressed${outputExt}"`);
    return c.body(data);
  } catch (e: any) {
    console.error("video compress error", e);
    const msg = e.message || "Video compress failed";
    // friendly hint for Windows missing ffmpeg
    if (msg.includes("ffmpeg")) {
      return c.json({ error: msg, hint: "Windows Server需安装 ffmpeg 并加入 PATH，或设置环境变量 FFMPEG_PATH" }, 500);
    }
    return c.json({ error: msg }, 500);
  } finally {
    // 核心约束：文件不保存到服务器，用完即删
    await cleanupFiles(inputPath, outputPath);
  }
});

videoRoute.get("/presets", (c) => {
  return c.json({
    presets: ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"],
    crf: { min: 0, max: 51, default: 28, note: "越小质量越高，18~28 常用" },
  });
});
