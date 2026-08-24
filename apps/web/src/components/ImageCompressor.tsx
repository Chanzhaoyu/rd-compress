import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { compressImage, formatBytes } from "../lib/api";

export function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState("keep");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; size: string; ratio: string; originalSize: number; compressedSize: number } | null>(null);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onFileChange = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setCroppedFile(null);
    setResult(null);
    setError("");
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  };

  const getCroppedFile = async (): Promise<File | null> => {
    if (!crop || !imgRef.current || !file) return null;
    const img = imgRef.current;
    const canvas = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    canvas.width = Math.round(crop.width * scaleX);
    canvas.height = Math.round(crop.height * scaleY);
    if (canvas.width === 0 || canvas.height === 0) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      img,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        const newFile = new File([blob], file.name, { type: file.type });
        resolve(newFile);
      }, file.type);
    });
  };

  const handleCompress = async () => {
    const targetFile = file;
    if (!targetFile) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let uploadFile: File = targetFile;
      // if crop exists, apply it
      if (crop && crop.width > 0 && crop.height > 0) {
        const cf = await getCroppedFile();
        if (cf) {
          uploadFile = cf;
          setCroppedFile(cf);
        }
      }
      const res = await compressImage(uploadFile, {
        quality,
        format,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
      });
      const url = URL.createObjectURL(res.blob);
      setResult({
        url,
        size: formatBytes(res.compressedSize),
        ratio: res.ratio,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
      });
    } catch (e: any) {
      setError(e.message || "压缩失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" }}>
      <h3 style={{ margin: "0 0 12px 0" }}>图片压缩</h3>
      <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 16px 0" }}>支持 jpeg / png / webp / avif · 可选裁剪 · 后端 sharp 处理，文件不落地</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{
          border: "2px dashed #d1d5db",
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
          background: "#f9fafb",
          cursor: "pointer",
        }}
        onClick={() => document.getElementById("image-input")?.click()}
      >
        <input
          id="image-input"
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        />
        <div style={{ fontSize: 14, color: "#374151" }}>{file ? file.name + ` (${formatBytes(file.size)})` : "点击选择或拖拽图片到此处"}</div>
        {file && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>再次点击可更换文件</div>}
      </div>

      {preview && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>预览 & 裁剪 (拖拽选区，未选则压缩原图)</div>
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} style={{ maxWidth: 500 }}>
            <img ref={imgRef} src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 400, display: "block" }} />
          </ReactCrop>
          {crop && crop.width > 0 && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>已选 {Math.round(crop.width)} x {Math.round(crop.height)} (将先裁剪再压缩)</div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <label style={{ fontSize: 13 }}>
          质量: {quality}
          <input type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label style={{ fontSize: 13 }}>
          输出格式
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }}>
            <option value="keep">保持原格式</option>
            <option value="jpeg">jpeg</option>
            <option value="png">png</option>
            <option value="webp">webp</option>
            <option value="avif">avif</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          宽度 (可选, px)
          <input value={width} onChange={(e) => setWidth(e.target.value)} placeholder="例如 1920" style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          高度 (可选, px)
          <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="例如 1080" style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }} />
        </label>
      </div>

      <button
        onClick={handleCompress}
        disabled={!file || loading}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "10px 16px",
          background: !file || loading ? "#9ca3af" : "#111827",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: !file || loading ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
      >
        {loading ? "压缩中..." : "开始压缩"}
      </button>

      {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: 13, background: "#fef2f2", padding: 10, borderRadius: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>压缩完成</div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
            原始: {formatBytes(result.originalSize)} → 压缩后: {result.size} · 节省 {result.ratio}%
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <img src={result.url} alt="compressed" style={{ maxWidth: 240, maxHeight: 160, borderRadius: 6, border: "1px solid #d1d5db" }} />
            <a href={result.url} download={`compressed-${Date.now()}.jpg`} style={{ padding: "8px 14px", background: "#15803d", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              下载结果
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
