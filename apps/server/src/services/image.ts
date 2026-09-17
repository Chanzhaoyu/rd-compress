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

  let pipeline = sharp(input, { failOn: "none" }).rotate();
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

  const mime: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
  };

  let buffer: Buffer;
  switch (outputFormat) {
    case "jpeg":
      buffer = await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
      break;
    case "png":
      buffer = await pipeline.png({ quality: Math.round(quality), compressionLevel: 9, palette: quality < 90 }).toBuffer();
      break;
    case "webp":
      buffer = await pipeline.webp({ quality }).toBuffer();
      break;
    case "avif":
      buffer = await pipeline.avif({ quality }).toBuffer();
      break;
    default:
      outputFormat = "jpeg";
      buffer = await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  const contentType = mime[outputFormat] || "image/jpeg";
  const inputFormat = meta.format === "jpg" ? "jpeg" : meta.format;
  const unchangedSize = !width && !height;
  const sameFormat = inputFormat === outputFormat;
  if (unchangedSize && sameFormat && buffer.length >= input.length) {
    return { data: input, format: String(outputFormat), contentType };
  }

  return { data: buffer, format: outputFormat, contentType };
}
