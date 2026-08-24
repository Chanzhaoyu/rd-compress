import sharp from "sharp";

export type ImageFormat = "jpeg" | "png" | "webp" | "avif" | "keep";

export interface CompressImageOptions {
  quality?: number; // 1-100
  format?: ImageFormat;
  width?: number;
  height?: number;
  lossless?: boolean;
}

export async function compressImage(
  input: Buffer,
  opts: CompressImageOptions
): Promise<{ data: Buffer; format: string; contentType: string }> {
  const { quality = 80, format = "keep", width, height } = opts;

  let pipeline = sharp(input, { failOn: "none" });
  const meta = await pipeline.metadata();

  // resize if needed (without enlarge by default)
  if (width || height) {
    pipeline = pipeline.resize({
      width: width || undefined,
      height: height || undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  let outputFormat = format;
  if (format === "keep") {
    outputFormat = (meta.format as ImageFormat) || "jpeg";
    if (!["jpeg", "png", "webp", "avif"].includes(outputFormat)) outputFormat = "jpeg";
  }

  let contentType = "image/jpeg";
  let buffer: Buffer;

  switch (outputFormat) {
    case "jpeg":
      buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      contentType = "image/jpeg";
      break;
    case "png":
      // quality for png is compression level mapping 100->0, 0->9? Use palette for better
      buffer = await pipeline.png({ quality: Math.round(quality), compressionLevel: 9, palette: quality < 90 }).toBuffer();
      contentType = "image/png";
      break;
    case "webp":
      buffer = await pipeline.webp({ quality }).toBuffer();
      contentType = "image/webp";
      break;
    case "avif":
      buffer = await pipeline.avif({ quality }).toBuffer();
      contentType = "image/avif";
      break;
    default:
      buffer = await pipeline.jpeg({ quality }).toBuffer();
      contentType = "image/jpeg";
  }

  return { data: buffer, format: outputFormat, contentType };
}
