import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ImageCompressor } from "./components/ImageCompressor";
import { VideoCompressor } from "./components/VideoCompressor";
import { Image as ImageIcon, Video as VideoIcon, Sparkles, ShieldCheck } from "lucide-react";

export default function App() {
  const [health, setHealth] = useState<{ ok: boolean; text: string }>({ ok: false, text: "检测中..." });

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || "";
    fetch(`${base}/api/health`)
      .then((r) => r.json())
      .then((j) => {
        if (j.status !== "ok") {
          setHealth({ ok: false, text: "服务异常" });
          return;
        }
        if (j.ffmpeg && j.ffmpeg.ok === false) {
          setHealth({ ok: true, text: "服务正常（无 ffmpeg）" });
          return;
        }
        setHealth({ ok: true, text: "服务正常" });
      })
      .catch(() => setHealth({ ok: false, text: "服务未连接" }));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none tracking-tight">Redon Compress</h1>
              <p className="text-xs text-muted-foreground">内部图片 · 视频压缩工具</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={health.ok ? "default" : "secondary"} className="gap-1.5 font-normal">
              <span className={`h-2 w-2 rounded-full ${health.ok ? "bg-emerald-400" : "bg-muted-foreground"}`} />
              {health.text}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">压缩你的媒体文件</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> 处理完删除临时文件，不持久化存储
            </p>
          </div>
        </div>

        <Tabs defaultValue="image" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon className="h-4 w-4" /> 图片压缩
            </TabsTrigger>
            <TabsTrigger value="video" className="gap-2">
              <VideoIcon className="h-4 w-4" /> 视频压缩
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image">
            <ImageCompressor />
          </TabsContent>
          <TabsContent value="video">
            <VideoCompressor />
          </TabsContent>
        </Tabs>

        <footer className="mt-10 text-center text-xs text-muted-foreground">© Redon Compress · 内网工具 · 基于 Hono + Sharp / FFmpeg</footer>
      </main>
    </div>
  );
}
