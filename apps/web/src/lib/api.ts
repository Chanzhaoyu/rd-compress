const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: string;
  format?: string;
}

async function handleResponse(res: Response): Promise<CompressResult> {
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || `Request failed: ${res.status}`);
    } catch (e: any) {
      if (e.message && !e.message.startsWith("{")) throw e;
      throw new Error(text || `Request failed: ${res.status}`);
    }
  }
  const blob = await res.blob();
  const originalSize = Number(res.headers.get("X-Original-Size") || 0);
  const compressedSize = Number(res.headers.get("X-Compressed-Size") || Number(blob.size));
  const ratio = res.headers.get("X-Compression-Ratio") || "0";
  const format = res.headers.get("X-Output-Format") || undefined;
  return { blob, originalSize, compressedSize, ratio, format };
}

export async function compressImage(
  file: File,
  opts: { quality: number; format: string; width?: number; height?: number }
): Promise<CompressResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("quality", String(opts.quality));
  fd.append("format", opts.format);
  if (opts.width) fd.append("width", String(opts.width));
  if (opts.height) fd.append("height", String(opts.height));

  const res = await fetch(`${API_BASE}/api/compress/image`, {
    method: "POST",
    body: fd,
  });
  return handleResponse(res);
}

export async function compressVideo(
  file: File,
  opts: { crf: number; preset: string; width?: number; height?: number; fps?: number; noAudio?: boolean },
  onProgress?: (loaded: number, total: number) => void
): Promise<CompressResult> {
  // Use XHR for upload progress if needed, fallback to fetch
  // Simple fetch version here; can be upgraded to XHR for progress
  if (onProgress) {
    return compressVideoWithXHR(file, opts, onProgress);
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("crf", String(opts.crf));
  fd.append("preset", opts.preset);
  if (opts.width) fd.append("width", String(opts.width));
  if (opts.height) fd.append("height", String(opts.height));
  if (opts.fps) fd.append("fps", String(opts.fps));
  if (opts.noAudio) fd.append("noAudio", "true");

  const res = await fetch(`${API_BASE}/api/compress/video`, { method: "POST", body: fd });
  return handleResponse(res);
}

function compressVideoWithXHR(
  file: File,
  opts: { crf: number; preset: string; width?: number; height?: number; fps?: number; noAudio?: boolean },
  onProgress: (loaded: number, total: number) => void
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/compress/video`);
    xhr.responseType = "blob";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      // reconstruct headers
      const get = (k: string) => xhr.getResponseHeader(k);
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        resolve({
          blob,
          originalSize: Number(get("X-Original-Size") || file.size),
          compressedSize: Number(get("X-Compressed-Size") || blob.size),
          ratio: get("X-Compression-Ratio") || "0",
        });
      } else {
        // try parse error json
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result as string);
            reject(new Error(json.error || `Failed ${xhr.status}`));
          } catch {
            reject(new Error(`Failed ${xhr.status}`));
          }
        };
        reader.readAsText(xhr.response as Blob);
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("crf", String(opts.crf));
    fd.append("preset", opts.preset);
    if (opts.width) fd.append("width", String(opts.width));
    if (opts.height) fd.append("height", String(opts.height));
    if (opts.fps) fd.append("fps", String(opts.fps));
    if (opts.noAudio) fd.append("noAudio", "true");
    xhr.send(fd);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
