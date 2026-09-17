import { useState, useEffect, useMemo } from "react";
import { compressVideo, formatBytes } from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Video as VideoIcon, Download, Loader2, Sparkles, Trash2, RotateCcw } from "lucide-react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { formatSizeDelta } from "@/lib/utils";

const VIDEO_DEFAULTS = { crf: 28, preset: "medium", width: "", height: "", fps: "", noAudio: false };
const VIDEO_KEY = "redon-compress:video-settings";

function crfBadgeClass(crf: number) {
  if (crf <= 20) return "bg-emerald-500 text-white hover:bg-emerald-600 border-transparent";
  if (crf <= 25) return "bg-sky-500 text-white hover:bg-sky-600 border-transparent";
  if (crf <= 30) return "bg-amber-500 text-white hover:bg-amber-600 border-transparent";
  return "bg-red-500 text-white hover:bg-red-600 border-transparent";
}

export function VideoCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [crf, setCrf] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).crf);
  const [preset, setPreset] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).preset);
  const [width, setWidth] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).width);
  const [height, setHeight] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).height);
  const [fps, setFps] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).fps);
  const [noAudio, setNoAudio] = useState(() => loadSettings(VIDEO_KEY, VIDEO_DEFAULTS).noAudio);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; size: string; ratio: string; originalSize: number; compressedSize: number } | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  useEffect(() => {
    saveSettings(VIDEO_KEY, { crf, preset, width, height, fps, noAudio });
  }, [crf, preset, width, height, fps, noAudio]);

  const resetSettings = () => {
    setCrf(VIDEO_DEFAULTS.crf);
    setPreset(VIDEO_DEFAULTS.preset);
    setWidth(VIDEO_DEFAULTS.width);
    setHeight(VIDEO_DEFAULTS.height);
    setFps(VIDEO_DEFAULTS.fps);
    setNoAudio(VIDEO_DEFAULTS.noAudio);
  };

  const onFileChange = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError("");
    setProgress(0);
  };

  const clear = () => {
    setFile(null);
    setResult(null);
    setError("");
    setProgress(0);
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
        (loaded, total) => setProgress(Math.min(90, Math.round((loaded / total) * 90)))
      );
      setResult({ blob: res.blob, size: formatBytes(res.compressedSize), ratio: res.ratio, originalSize: res.originalSize, compressedSize: res.compressedSize });
      setProgress(100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "视频压缩失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <VideoIcon className="h-4 w-4" /> 视频上传
          </CardTitle>
          <CardDescription>MP4 / MOV / WebM / MKV · 最大 500MB · 转码为 H.264</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) onFileChange(f);
            }}
            onClick={() => document.getElementById("video-input")?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50"}`}
          >
            <input id="video-input" type="file" accept="video/*" className="hidden" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
            <div className="rounded-full bg-primary/10 p-3">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <p className="mt-3 text-sm font-medium">{file ? file.name : "点击或拖拽视频到此处"}</p>
            <p className="text-xs text-muted-foreground">{file ? formatBytes(file.size) : "支持常见视频格式"}</p>
          </div>

          {file && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>原视频预览</Label>
                <Button variant="ghost" size="sm" onClick={clear} className="h-7 gap-1 text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> 清除
                </Button>
              </div>
              <video src={previewUrl || undefined} controls className="w-full rounded-lg border bg-black" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" /> 压缩参数
                </CardTitle>
                <CardDescription>自动本地保存 · CRF 越小质量越高</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetSettings} className="h-7 shrink-0 gap-1 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>CRF 质量</Label>
                <Badge className={`font-mono ${crfBadgeClass(crf)}`}>{crf}</Badge>
              </div>
              <Slider value={[crf]} min={18} max={35} step={1} onValueChange={([v]) => setCrf(v)} />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">高质量</span>
                <span className={`font-medium ${crf <= 20 ? "text-emerald-600" : crf <= 25 ? "text-sky-500" : crf <= 30 ? "text-amber-500" : "text-red-500"}`}>
                  {crf <= 20 ? "极清" : crf <= 23 ? "推荐" : crf <= 28 ? "均衡" : "极致压缩"}
                </span>
                <span className="text-muted-foreground">高压缩</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preset</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ultrafast">ultrafast 最快</SelectItem>
                  <SelectItem value="veryfast">veryfast</SelectItem>
                  <SelectItem value="faster">faster</SelectItem>
                  <SelectItem value="fast">fast</SelectItem>
                  <SelectItem value="medium">medium 均衡</SelectItem>
                  <SelectItem value="slow">slow 更小</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>宽度</Label>
                <Input placeholder="1280" value={width} onChange={(e) => setWidth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>高度</Label>
                <Input placeholder="720" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>帧率 (可选)</Label>
              <Input placeholder="30" value={fps} onChange={(e) => setFps(e.target.value)} />
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input type="checkbox" checked={noAudio} onChange={(e) => setNoAudio(e.target.checked)} className="rounded" />
              去除音频
            </label>

            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress < 90 ? "上传中" : "转码中"}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <Button onClick={handleCompress} disabled={!file || loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 处理中...
                </>
              ) : (
                "开始压缩"
              )}
            </Button>
            {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          </CardContent>
        </Card>

        {result && (
          <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">压缩完成</CardTitle>
              <CardDescription>
                {formatBytes(result.originalSize)} → {result.size} · {(() => {
                  const delta = formatSizeDelta(result.originalSize, result.compressedSize);
                  return `${delta.grew ? "增大" : "节省"} ${delta.text}`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <video src={resultUrl || undefined} controls className="w-full rounded-lg border bg-black" />
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                if (!resultUrl) return;
                const a = document.createElement("a");
                a.href = resultUrl;
                const base = file?.name.replace(/\.[^.]+$/, "") || "video";
                a.download = `${base}-compressed.mp4`;
                a.click();
              }}>
                <Download className="h-4 w-4" /> 下载视频
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
