import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import JSZip from "jszip";
import { compressImage, formatBytes } from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Crop as CropIcon, Download, Loader2, Sparkles, Trash2, Image as ImageIcon, X, RefreshCw, PackageOpen, RotateCcw } from "lucide-react";
import { loadSettings, saveSettings } from "@/lib/settings";

type Status = "pending" | "compressing" | "done" | "error";

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: Status;
  originalSize: number;
  compressedSize?: number;
  ratio?: string;
  blob?: Blob;
  blobUrl?: string;
  error?: string;
  format?: string;
}

const IMAGE_DEFAULTS = { quality: 80, format: "keep", width: "", height: "" };
const IMAGE_KEY = "redon-compress:image-settings";

function qualityBadgeClass(q: number) {
  if (q <= 30) return "bg-red-500 text-white hover:bg-red-600 border-transparent";
  if (q <= 60) return "bg-amber-500 text-white hover:bg-amber-600 border-transparent";
  if (q <= 80) return "bg-sky-500 text-white hover:bg-sky-600 border-transparent";
  return "bg-emerald-500 text-white hover:bg-emerald-600 border-transparent";
}

export function ImageCompressor() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [quality, setQuality] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).quality);
  const [format, setFormat] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).format);
  const [width, setWidth] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).width);
  const [height, setHeight] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).height);
  const [dragOver, setDragOver] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 本地记录（初始化已从 localStorage 读取，此处仅持久化变更）
  useEffect(() => {
    saveSettings(IMAGE_KEY, { quality, format, width, height });
  }, [quality, format, width, height]);

  const resetSettings = () => {
    setQuality(IMAGE_DEFAULTS.quality);
    setFormat(IMAGE_DEFAULTS.format);
    setWidth(IMAGE_DEFAULTS.width);
    setHeight(IMAGE_DEFAULTS.height);
  };

  const singleItem = items.length === 1 ? items[0] : null;
  const showCrop = !!singleItem && singleItem.status !== "done";

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    // TinyPNG 风格限制：最多 20 张，单张 30MB 由后端控制，这里前端先限 20
    const remaining = 20 - items.length;
    const slice = remaining > 0 ? arr.slice(0, remaining) : [];
    if (slice.length === 0) return;
    const newItems: BatchItem[] = slice.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
      originalSize: file.size,
    }));
    setItems((prev) => [...prev, ...newItems]);
    // 自动开始压缩（像 TinyPNG），并发 3
    setTimeout(() => {
      const concurrency = 3;
      let idx = 0;
      const run = async () => {
        while (idx < newItems.length) {
          const cur = newItems[idx++];
          await compressOne(cur.id, cur, newItems.length === 1 && items.length === 0);
        }
      };
      Promise.all(Array.from({ length: Math.min(concurrency, newItems.length) }, run));
    }, 50);
  }, [items.length]);

  const compressOne = async (id: string, overrideItem?: BatchItem, allowCrop = false) => {
    const target = overrideItem || items.find((i) => i.id === id);
    if (!target) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "compressing", error: undefined } : it)));

    // 若单张且有裁剪，优先裁剪（仅 allowCrop 时）
    let fileToSend: File | null = null;
    if (allowCrop && crop && crop.width > 0 && crop.height && imgRef.current) {
      const img = imgRef.current;
      const canvas = document.createElement("canvas");
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      canvas.width = Math.round(crop.width * scaleX);
      canvas.height = Math.round(crop.height * scaleY);
      if (canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, canvas.width, canvas.height);
          const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, target?.file.type || "image/jpeg"));
          if (blob) fileToSend = new File([blob], target!.file.name, { type: target!.file.type });
        }
      }
    }
    if (!fileToSend) fileToSend = target!.file;

    try {
      const res = await compressImage(fileToSend, {
        quality,
        format,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
      });
      const url = URL.createObjectURL(res.blob);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                status: "done",
                compressedSize: res.compressedSize,
                ratio: res.ratio,
                blob: res.blob,
                blobUrl: url,
                format: res.format,
              }
            : it
        )
      );
    } catch (e: any) {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: e.message || "压缩失败" } : it)));
    }
  };

  const compressAll = async () => {
    const pending = items.filter((i) => i.status === "pending" || i.status === "error");
    const toCompress = pending.length > 0 ? pending : items.filter((i) => i.status === "done");
    const list = toCompress.length > 0 ? toCompress : items;
    const allowCrop = list.length === 1 && items.length === 1;
    const concurrency = 3;
    let idx = 0;
    const run = async () => {
      while (idx < list.length) {
        const cur = list[idx++];
        await compressOne(cur.id, cur, allowCrop);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, run));
  };

  const removeOne = (id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it) {
        URL.revokeObjectURL(it.preview);
        if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => {
      URL.revokeObjectURL(it.preview);
      if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
    });
    setItems([]);
    setCrop(undefined);
  };

  const downloadOne = (item: BatchItem) => {
    if (!item.blobUrl) return;
    const a = document.createElement("a");
    a.href = item.blobUrl;
    const ext = item.format || item.file.name.split(".").pop() || "jpg";
    const base = item.file.name.replace(/\.[^.]+$/, "");
    a.download = `${base}-compressed.${ext}`;
    a.click();
  };

  const downloadAll = async () => {
    const done = items.filter((i) => i.status === "done" && i.blob);
    if (done.length === 0) return;
    if (done.length === 1) {
      downloadOne(done[0]);
      return;
    }
    const zip = new JSZip();
    done.forEach((it) => {
      const ext = it.format || it.file.name.split(".").pop() || "jpg";
      const base = it.file.name.replace(/\.[^.]+$/, "");
      zip.file(`${base}-compressed.${ext}`, it.blob!);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `redon-compress-${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const totalOriginal = items.reduce((s, i) => s + i.originalSize, 0);
  const totalCompressed = items.filter((i) => i.compressedSize).reduce((s, i) => s + (i.compressedSize || 0), 0);
  const totalRatio = totalOriginal > 0 && totalCompressed > 0 ? (((totalOriginal - totalCompressed) / totalOriginal) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* 上传区 - TinyPNG 风格大虚线 */}
      <Card className="overflow-hidden">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center px-6 py-10 text-center transition-colors ${dragOver ? "bg-primary/5" : "bg-muted/30 hover:bg-muted/50"} border-2 ${dragOver ? "border-primary" : "border-dashed border-muted-foreground/20"} m-4 rounded-lg`}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div className="rounded-full bg-primary p-3">
            <Upload className="h-7 w-7 text-primary-foreground" />
          </div>
          <p className="mt-4 text-base font-medium">拖拽图片到此处</p>
          <p className="text-sm text-muted-foreground">或点击选择 · 支持批量最多 20 张 · 单张最大 30MB</p>
          <p className="mt-2 text-xs text-muted-foreground">JPEG / PNG / WebP / AVIF · 保持透明通道</p>
          {items.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Badge variant="secondary">{items.length}/20 已选择</Badge>
              {doneCount > 0 && <Badge className="bg-emerald-600 hover:bg-emerald-700">{doneCount} 已完成</Badge>}
            </div>
          )}
        </div>
      </Card>

      {/* 参数与批量操作 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" /> 压缩参数
                </CardTitle>
                <CardDescription>修改后点击“重新压缩”生效 · 自动本地保存</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetSettings} className="h-7 shrink-0 gap-1 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>质量</Label>
                <Badge className={`font-mono ${qualityBadgeClass(quality)}`}>{quality}</Badge>
              </div>
              <Slider value={[quality]} min={1} max={100} step={1} onValueChange={([v]) => setQuality(v)} />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">体积优先</span>
                <span className={`font-medium ${quality <= 30 ? "text-red-500" : quality <= 60 ? "text-amber-500" : quality <= 80 ? "text-sky-500" : "text-emerald-600"}`}>
                  {quality <= 30 ? "极致压缩" : quality <= 60 ? "均衡偏小" : quality <= 80 ? "均衡" : "高质量"}
                </span>
                <span className="text-muted-foreground">质量优先</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>输出格式</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">保持原格式</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="avif">AVIF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>宽度</Label>
                <Input placeholder="1920" value={width} onChange={(e) => setWidth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>高度</Label>
                <Input placeholder="1080" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </div>

            <Button onClick={downloadAll} disabled={doneCount === 0} className="w-full gap-2">
              <PackageOpen className="h-4 w-4" /> {doneCount > 1 ? `下载全部 (${doneCount} 张 ZIP)` : doneCount === 1 ? "下载结果" : "下载全部"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={compressAll} disabled={items.length === 0} variant="outline" className="gap-1.5 whitespace-nowrap">
                <RefreshCw className="h-4 w-4 shrink-0" /> 重新压缩
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={items.length === 0} className="gap-1.5 whitespace-nowrap">
                <Trash2 className="h-4 w-4 shrink-0" /> 清空列表
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 裁剪仅单张时显示 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" /> {items.length === 0 ? "等待上传" : `队列 ${items.length} 张`}
            </CardTitle>
            <CardDescription>
              {items.length === 0
                ? "上传后自动压缩，可单独裁剪单张"
                : `已完成 ${doneCount}/${items.length} · 总计 ${formatBytes(totalOriginal)} → ${totalCompressed ? formatBytes(totalCompressed) : "-"} · 节省 ${totalRatio}%`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">暂无图片，拖拽多张试试</div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <img src={it.preview} alt={it.file.name} className="h-14 w-14 rounded object-cover border" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.file.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatBytes(it.originalSize)}</span>
                        {it.status === "done" && it.compressedSize !== undefined && (
                          <>
                            <span>→</span>
                            <span className="font-medium text-emerald-600">{formatBytes(it.compressedSize)}</span>
                            <Badge variant="secondary" className="px-1 py-0 text-[10px] leading-none">
                              -{it.ratio}%
                            </Badge>
                          </>
                        )}
                        {it.status === "compressing" && <Badge className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 压缩中</Badge>}
                        {it.status === "error" && <span className="text-destructive">{it.error}</span>}
                        {it.status === "pending" && <span className="text-muted-foreground">等待中</span>}
                      </div>
                      {it.status === "compressing" && <Progress value={66} className="mt-1 h-1" />}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {it.status === "done" && (
                        <Button size="sm" variant="outline" onClick={() => downloadOne(it)} className="h-7 px-2">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(it.status === "error" || it.status === "pending") && (
                        <Button size="sm" variant="ghost" onClick={() => compressOne(it.id, it, items.length === 1)} className="h-7 px-2">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeOne(it.id)} className="h-7 px-2">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 单张裁剪 */}
            {showCrop && singleItem && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label className="flex items-center gap-1.5">
                  <CropIcon className="h-3.5 w-3.5" /> 裁剪单张（可选，再压缩）
                </Label>
                <div className="overflow-hidden rounded-lg border bg-background">
                  <ReactCrop crop={crop} onChange={(c) => setCrop(c)}>
                    <img ref={imgRef} src={singleItem.preview} alt="crop" className="max-h-[300px] w-full object-contain" />
                  </ReactCrop>
                </div>
                <p className="text-xs text-muted-foreground">
                  {crop && crop.width > 0 ? `已选 ${Math.round(crop.width)} × ${Math.round(crop.height)}` : "拖拽选区，不选则压缩原图"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
