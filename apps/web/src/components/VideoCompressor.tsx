import { useState } from "react";
import { compressVideo, formatBytes } from "../lib/api";

export function VideoCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [crf, setCrf] = useState(28);
  const [preset, setPreset] = useState("medium");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [fps, setFps] = useState("");
  const [noAudio, setNoAudio] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; size: string; ratio: string; originalSize: number; compressedSize: number } | null>(null);
  const [error, setError] = useState("");

  const onFileChange = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError("");
    setProgress(0);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  };

  const handleCompress = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    setProgress(0);
    try {
      const res = await compressVideo(
        file,
        {
          crf,
          preset,
          width: width ? Number(width) : undefined,
          height: height ? Number(height) : undefined,
          fps: fps ? Number(fps) : undefined,
          noAudio,
        },
        (loaded, total) => {
          setProgress(Math.round((loaded / total) * 100));
        }
      );
      const url = URL.createObjectURL(res.blob);
      setResult({
        url,
        size: formatBytes(res.compressedSize),
        ratio: res.ratio,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
      });
      setProgress(100);
    } catch (e: any) {
      setError(e.message || "视频压缩失败，请确认后端 ffmpeg 已安装");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" }}>
      <h3 style={{ margin: "0 0 12px 0" }}>视频压缩</h3>
      <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 16px 0" }}>后端 ffmpeg 转码为 H.264/mp4 · 文件不落地 · 支持分辨率/帧率/去音频</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{ border: "2px dashed #d1d5db", borderRadius: 10, padding: 24, textAlign: "center", background: "#f9fafb", cursor: "pointer" }}
        onClick={() => document.getElementById("video-input")?.click()}
      >
        <input id="video-input" type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
        <div style={{ fontSize: 14, color: "#374151" }}>{file ? file.name + ` (${formatBytes(file.size)})` : "点击选择或拖拽视频到此处"}</div>
        {file && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>最大 500MB · 再次点击可更换</div>}
      </div>

      {file && (
        <video src={URL.createObjectURL(file)} controls style={{ width: "100%", maxWidth: 500, marginTop: 12, borderRadius: 8, background: "#000" }} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <label style={{ fontSize: 13 }}>
          CRF: {crf} (越小质量越高)
          <input type="range" min={18} max={35} value={crf} onChange={(e) => setCrf(Number(e.target.value))} style={{ width: "100%" }} />
          <span style={{ fontSize: 11, color: "#6b7280" }}>推荐 23-28，28 体积更小</span>
        </label>
        <label style={{ fontSize: 13 }}>
          Preset
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }}>
            <option value="ultrafast">ultrafast (最快)</option>
            <option value="veryfast">veryfast</option>
            <option value="faster">faster</option>
            <option value="fast">fast</option>
            <option value="medium">medium (均衡)</option>
            <option value="slow">slow (更小体积)</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          宽度
          <input value={width} onChange={(e) => setWidth(e.target.value)} placeholder="例如 1280" style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          高度
          <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="例如 720" style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          帧率 (fps, 可选)
          <input value={fps} onChange={(e) => setFps(e.target.value)} placeholder="例如 30" style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #d1d5db", marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
          <input type="checkbox" checked={noAudio} onChange={(e) => setNoAudio(e.target.checked)} /> 去除音频
        </label>
      </div>

      {loading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>上传/处理中 {progress}%</div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#111827", borderRadius: 999, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

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
        {loading ? "处理中... (请耐心等待，大视频需数十秒)" : "开始压缩"}
      </button>

      {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: 13, background: "#fef2f2", padding: 10, borderRadius: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>压缩完成</div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
            原始: {formatBytes(result.originalSize)} → 压缩后: {result.size} · 节省 {result.ratio}%
          </div>
          <video src={result.url} controls style={{ width: "100%", maxWidth: 500, marginTop: 12, borderRadius: 8, background: "#000" }} />
          <a href={result.url} download={`compressed-${Date.now()}.mp4`} style={{ display: "inline-block", marginTop: 12, padding: "8px 14px", background: "#15803d", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            下载视频
          </a>
        </div>
      )}
    </div>
  );
}
