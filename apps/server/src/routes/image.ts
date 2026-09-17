import { Hono } from "hono";
import { compressImage, type ImageFormat } from "../services/image.js";

const ALLOWED_FORMATS: ImageFormat[] = ["jpeg", "png", "webp", "avif", "keep"];
const MAX_IMAGE_SIZE = 30 * 1024 * 1024; // 30MB

export const imageRoute = new Hono();

imageRoute.post("/", async (c) => {
  const body = await c.req.parseBody({ all: false });
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing file field 'file'" }, 400);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return c.json({ error: `File too large, max ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }, 413);
  }

  if (file.type && !file.type.startsWith("image/")) {
    return c.json({ error: "Unsupported image type" }, 400);
  }

  const quality = body["quality"] ? Number(body["quality"]) : 80;
  const format = (body["format"] as string) || "keep";
  const width = body["width"] ? Number(body["width"]) : undefined;
  const height = body["height"] ? Number(body["height"]) : undefined;

  if (Number.isNaN(quality) || quality < 1 || quality > 100) return c.json({ error: "quality must be 1-100" }, 400);
  if (!ALLOWED_FORMATS.includes(format as ImageFormat)) return c.json({ error: `format must be one of ${ALLOWED_FORMATS.join(",")}` }, 400);
  if (width !== undefined && (Number.isNaN(width) || width < 1 || width > 8000)) return c.json({ error: "width invalid" }, 400);
  if (height !== undefined && (Number.isNaN(height) || height < 1 || height > 8000)) return c.json({ error: "height invalid" }, 400);

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  try {
    const { data, format: outFormat, contentType } = await compressImage(inputBuffer, {
      quality,
      format: format as ImageFormat,
      width,
      height,
    });

    const originalSize = inputBuffer.length;
    const compressedSize = data.length;
    const safeName = sanitizeBaseName(file.name);

    c.header("Content-Type", contentType);
    c.header("Content-Length", String(data.length));
    c.header("X-Original-Size", String(originalSize));
    c.header("X-Compressed-Size", String(compressedSize));
    c.header("X-Compression-Ratio", ((1 - compressedSize / originalSize) * 100).toFixed(2));
    c.header("X-Output-Format", outFormat);
    c.header("Content-Disposition", `attachment; filename="${safeName}-compressed.${outFormat}"`);
    const payload = new Uint8Array(data.byteLength);
    payload.set(data);
    return new Response(payload, { headers: c.res.headers });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Compress failed";
    console.error("image compress error", e);
    return c.json({ error: message }, 500);
  }
});

imageRoute.get("/formats", (c) => {
  return c.json({ formats: ALLOWED_FORMATS });
});

function sanitizeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
  return base || "image";
}
