import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { imageRoute } from "./routes/image.js";
import { videoRoute } from "./routes/video.js";
import { checkFfmpeg } from "./utils/ffmpeg.js";
import { cleanupStaleTemp } from "./utils/temp.js";

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return corsOrigins[0] || "*";
      if (corsOrigins.length === 0) return origin;
      return corsOrigins.includes(origin) ? origin : corsOrigins[0];
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Original-Size", "X-Compressed-Size", "X-Compression-Ratio", "X-Output-Format", "Content-Disposition"],
  })
);

app.use(
  "/api/compress/*",
  bodyLimit({
    maxSize: 500 * 1024 * 1024,
    onError: (c) => c.json({ error: "File too large, max 500MB" }, 413),
  })
);

app.get("/api/health", async (c) => {
  const ff = await checkFfmpeg();
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    version: "0.1.0",
    ffmpeg: { path: ff.path, bundled: ff.bundled, ok: ff.ok, version: ff.version },
    platform: `${process.platform}-${process.arch}`,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.route("/api/compress/image", imageRoute);
app.route("/api/compress/video", videoRoute);

app.get("/", (c) => {
  return c.json({
    name: "redon-compress server",
    docs: {
      health: "GET /api/health",
      image: "POST /api/compress/image (multipart file, quality, format, width, height)",
      video: "POST /api/compress/video (multipart file, crf, preset, width, height, fps, noAudio)",
    },
  });
});

// 404
app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

const port = Number(process.env.PORT) || 6070;
console.log(`[redon-compress] Starting server on port ${port}...`);

cleanupStaleTemp().catch(() => undefined);
setInterval(() => {
  cleanupStaleTemp().catch(() => undefined);
}, 30 * 60 * 1000).unref();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[redon-compress] Server running at http://localhost:${info.port}`);
    console.log(`[redon-compress] Health: http://localhost:${info.port}/api/health`);
  }
);
