import { useState, useEffect } from "react";
import { ImageCompressor } from "./components/ImageCompressor";
import { VideoCompressor } from "./components/VideoCompressor";

type Tab = "image" | "video";

export default function App() {
  const [tab, setTab] = useState<Tab>("image");
  const [health, setHealth] = useState<string>("");

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || "";
    fetch(`${base}/api/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.status === "ok" ? "后端已连接" : ""))
      .catch(() => setHealth("后端未连接 (仅本地预览)"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ background: "#111827", color: "#fff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>RD Compress</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>内部图片/视频压缩工具站 · 文件不落地 · IIS静态 + Hono后端(PM2)</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, background: health.includes("已连接") ? "#15803d" : "#6b7280", padding: "4px 10px", borderRadius: 999 }}>{health || "检测中..."}</div>
      </header>

      <div style={{ maxWidth: 960, margin: "24px auto", padding: "0 16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setTab("image")}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: tab === "image" ? "#111827" : "#fff",
              color: tab === "image" ? "#fff" : "#111827",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            图片压缩
          </button>
          <button
            onClick={() => setTab("video")}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: tab === "video" ? "#111827" : "#fff",
              color: tab === "video" ? "#fff" : "#111827",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            视频压缩
          </button>
        </div>

        {tab === "image" ? <ImageCompressor /> : <VideoCompressor />}

        <div style={{ marginTop: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: "#111827", marginBottom: 6 }}>部署说明</div>
          <div>
            前端：<code>pnpm --filter @rd-compress/web build</code> 后将 <code>apps/web/dist</code> 部署到 IIS 静态站点
          </div>
          <div>
            后端：<code>pnpm --filter @rd-compress/server build && pm2 start ecosystem.config.js</code> (Windows Server)
          </div>
          <div>
            配置：前端 <code>.env.production</code> 设置 <code>VITE_API_BASE_URL=https://your-api-domain</code> (同域可留空，走反向代理)
          </div>
          <div style={{ marginTop: 8 }}>
            扩展预留：图片裁剪已接入 <code>react-image-crop</code>，后续编辑可在 <code>Pipeline</code> 中新增滤镜/水印插件，无需改动主流程。
          </div>
        </div>
      </div>
    </div>
  );
}
