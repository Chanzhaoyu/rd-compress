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
import { Upload, Crop as CropIcon, Download, Loader2, Sparkles, Trash2, Image as ImageIcon, X, RefreshCw, PackageOpen, RotateCcw, Copy, Check, Clipboard, Columns2 } from "lucide-react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

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
const MAX_ITEMS = 20;
const MAX_IMAGE_SIZE = 30 * 1024 * 1024;

const PRESETS = [
  { id: "wechat", label: "微信图", quality: 80, format: "jpeg", width: "1920", height: "" },
  { id: "doc", label: "文档 WebP", quality: 70, format: "webp", width: "", height: "" },
  { id: "hq", label: "高质量", quality: 90, format: "keep", width: "", height: "" },
] as const;

function qualityBadgeClass(q: number) {
  if (q <= 30) return "bg-red-500 text-white hover:bg-red-600 border-transparent";
  if (q <= 60) return "bg-amber-500 text-white hover:bg-amber-600 border-transparent";
  if (q <= 80) return "bg-sky-500 text-white hover:bg-sky-600 border-transparent";
  return "bg-emerald-500 text-white hover:bg-emerald-600 border-transparent";
}

function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const [boxW, setBoxW] = useState(0);
  const dragging = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const sync = () => setBoxW(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const update = (clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, next)));
  };

  return (
    <div
      ref={boxRef}
      className="relative h-[280px] w-full cursor-ew-resize overflow-hidden rounded-lg border bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%),linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] select-none"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) update(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <img src={after} alt="压缩后" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img src={before} alt="原图" className="h-full object-contain" style={{ width: boxW || "100%" }} draggable={false} />
      </div>
      <div className="absolute inset-y-0 z-10 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-foreground shadow">
          <Columns2 className="h-3.5 w-3.5" />
        </div>
      </div>
      <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">原图</span>
      <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">压缩后</span>
    </div>
  );
}

export function ImageCompressor() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [quality, setQuality] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).quality);
  const [format, setFormat] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).format);
  const [width, setWidth] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).width);
  const [height, setHeight] = useState(() => loadSettings(IMAGE_KEY, IMAGE_DEFAULTS).height);
  const [dragOver, setDragOver] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qualityRef = useRef(quality);
  const formatRef = useRef(format);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const cropRef = useRef(crop);
  const itemsRef = useRef(items);

  useEffect(() => {
    qualityRef.current = quality;
    formatRef.current = format;
    widthRef.current = width;
    heightRef.current = height;
  }, [quality, format, width, height]);
  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    saveSettings(IMAGE_KEY, { quality, format, width, height });
  }, [quality, format, width, height]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        URL.revokeObjectURL(it.preview);
        if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
      });
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2800);
  }, []);

  const resetSettings = () => {
    setQuality(IMAGE_DEFAULTS.quality);
    setFormat(IMAGE_DEFAULTS.format);
    setWidth(IMAGE_DEFAULTS.width);
    setHeight(IMAGE_DEFAULTS.height);
  };

  const applyPreset = (id: (typeof PRESETS)[number]["id"]) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setQuality(p.quality);
    setFormat(p.format);
    setWidth(p.width);
    setHeight(p.height);
  };

  const singleItem = items.length === 1 ? items[0] : null;
  const showCrop = !!singleItem && singleItem.status !== "done";

  const compressOne = useCallback(async (id: string, overrideItem?: BatchItem, allowCrop = false) => {
    const target = overrideItem || itemsRef.current.find((i) => i.id === id);
    if (!target) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "compressing", error: undefined } : it)));

    const currentCrop = cropRef.current;
    let fileToSend: File | null = null;
    if (allowCrop && currentCrop && currentCrop.width > 0 && currentCrop.height && imgRef.current) {
      const img = imgRef.current;
      const canvas = document.createElement("canvas");
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      canvas.width = Math.round(currentCrop.width * scaleX);
      canvas.height = Math.round(currentCrop.height * scaleY);
      if (canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            img,
            currentCrop.x * scaleX,
            currentCrop.y * scaleY,
            currentCrop.width * scaleX,
            currentCrop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
          );
          const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, target.file.type || "image/jpeg"));
          if (blob) fileToSend = new File([blob], target.file.name, { type: target.file.type });
        }
      }
    }
    if (!fileToSend) fileToSend = target.file;

    try {
      const w = widthRef.current;
      const h = heightRef.current;
      const res = await compressImage(fileToSend, {
        quality: qualityRef.current,
        format: formatRef.current,
        width: w ? Number(w) : undefined,
        height: h ? Number(h) : undefined,
      });
      const url = URL.createObjectURL(res.blob);
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
          return {
            ...it,
            status: "done",
            compressedSize: res.compressedSize,
            ratio: res.ratio,
            blob: res.blob,
            blobUrl: url,
            format: res.format,
          };
        })
      );
      if (itemsRef.current.length === 1) setCompareId(id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "压缩失败";
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: message } : it)));
    }
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const all = Array.from(files);
    const images = all.filter((f) => f.type.startsWith("image/"));
    const skippedType = all.length - images.length;
    const tooBig = images.filter((f) => f.size > MAX_IMAGE_SIZE);
    const valid = images.filter((f) => f.size <= MAX_IMAGE_SIZE);
    if (images.length === 0) {
      flash("未识别到图片，请选择 JPEG / PNG / WebP / AVIF");
      return;
    }
    const prev = itemsRef.current;
    const remaining = MAX_ITEMS - prev.length;
    if (remaining <= 0) {
      flash(`最多 ${MAX_ITEMS} 张，请先清空或移除部分`);
      return;
    }
    const slice = valid.slice(0, remaining);
    const overflow = valid.length - slice.length;
    const hints: string[] = [];
    if (skippedType > 0) hints.push(`${skippedType} 个非图片已忽略`);
    if (tooBig.length > 0) hints.push(`${tooBig.length} 张超过 30MB 已忽略`);
    if (overflow > 0) hints.push(`超出上限，已忽略 ${overflow} 张`);
    if (hints.length) flash(hints.join(" · "));

    if (slice.length === 0) return;
    const newItems: BatchItem[] = slice.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
      originalSize: file.size,
    }));
    setItems((p) => [...p, ...newItems]);
    const allowCrop = newItems.length === 1 && prev.length === 0;
    if (allowCrop) return;
    const concurrency = 3;
    let idx = 0;
    const run = async () => {
      while (idx < newItems.length) {
        const cur = newItems[idx++];
        await compressOne(cur.id, cur, false);
      }
    };
    void Promise.all(Array.from({ length: Math.min(concurrency, newItems.length) }, run));
  }, [compressOne, flash]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget) return;
      setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

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
    setCompareId((cur) => (cur === id ? null : cur));
  };


  const copyOne = async (item: BatchItem) => {
    if (!item.blob) return;
    try {
      const pngBlob = await new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(resolve, "image/png");
        };
        img.onerror = () => resolve(null);
        img.src = item.blobUrl || URL.createObjectURL(item.blob!);
      });
      if (!pngBlob) throw new Error("无法转换图片");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1600);
    } catch {
      flash("复制失败，请改用下载");
    }
  };
  const clearAll = () => {
    items.forEach((it) => {
      URL.revokeObjectURL(it.preview);
      if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
    });
    setItems([]);
    setCrop(undefined);
    setCompareId(null);
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

  const doneCount = items.filter((i) => i.status === "done").length;
  const totalOriginal = items.reduce((s, i) => s + i.originalSize, 0);
  const totalCompressed = items.filter((i) => i.compressedSize).reduce((s, i) => s + (i.compressedSize || 0), 0);
  const totalRatio = totalOriginal > 0 && totalCompressed > 0 ? (((totalOriginal - totalCompressed) / totalOriginal) * 100).toFixed(1) : "0";
  const activePreset = PRESETS.find((p) => p.quality === quality && p.format === format && p.width === width && p.height === height)?.id;
  const compareItem = items.find((i) => i.id === compareId && i.status === "done" && i.blobUrl) ?? null;

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="relative space-y-4">
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-background/90 px-10 py-8 text-center shadow-lg">
            <Upload className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-base font-medium">松开即可添加图片</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {notice && (
        <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{notice}</div>
      )}

      {items.length === 0 ? (
        <Card className="overflow-hidden">
          <button type="button" onClick={openPicker} className="flex w-full flex-col items-center justify-center px-6 py-16 text-center transition-colors hover:bg-muted/40">
            <div className="rounded-full bg-primary p-3">
              <Upload className="h-7 w-7 text-primary-foreground" />
            </div>
            <p className="mt-4 text-base font-medium">拖拽、点击或粘贴图片</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Clipboard className="h-3.5 w-3.5" /> Ctrl / Cmd + V · 最多 20 张 · 单张 30MB
            </p>
            <p className="mt-2 text-xs text-muted-foreground">JPEG / PNG / WebP / AVIF · 单张可裁剪，批量自动压缩</p>
          </button>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              已完成 {doneCount}/{items.length}
              {doneCount > 0 && (
                <span className="ml-2 text-muted-foreground">
                  {formatBytes(totalOriginal)} → {formatBytes(totalCompressed)} · 节省 {totalRatio}%
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={openPicker}>
              <Upload className="h-3.5 w-3.5" /> 再添加
            </Button>
            <Button size="sm" onClick={downloadAll} disabled={doneCount === 0}>
              <PackageOpen className="h-3.5 w-3.5" /> {doneCount > 1 ? `下载 ZIP (${doneCount})` : "下载"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" /> 压缩参数
                </CardTitle>
                <CardDescription>预设一键套用 · 修改后点重新压缩</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetSettings} className="h-7 shrink-0 gap-1 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> 默认
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={activePreset === p.id ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
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
            <div className="flex flex-wrap gap-1.5">
              {["1920", "1280", "800"].map((w) => (
                <Button key={w} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setWidth(w)}>
                  {w}w
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={compressAll} disabled={items.length === 0} variant="outline" className="gap-1.5 whitespace-nowrap">
                <RefreshCw className="h-4 w-4 shrink-0" /> {items.some((i) => i.status === "pending" || i.status === "error") ? "开始压缩" : "重新压缩"}
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={items.length === 0} className="gap-1.5 whitespace-nowrap">
                <Trash2 className="h-4 w-4 shrink-0" /> 清空
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" /> {items.length === 0 ? "等待上传" : `队列 ${items.length} 张`}
            </CardTitle>
            <CardDescription>{items.length === 0 ? "粘贴截图或拖入图片开始" : "点击缩略图对比原图 / 压缩结果"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {compareItem?.blobUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>拖动分割线对比 · {compareItem.file.name}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setCompareId(null)}>
                    关闭
                  </Button>
                </div>
                <CompareSlider before={compareItem.preview} after={compareItem.blobUrl} />
              </div>
            )}

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">暂无图片</div>
            ) : (
              <div className="grid max-h-[520px] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border bg-card",
                      it.status === "done" && "border-emerald-200",
                      it.status === "error" && "border-destructive/40",
                      compareItem?.id === it.id && "ring-2 ring-primary"
                    )}
                  >
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => it.status === "done" && it.blobUrl && setCompareId(it.id)}
                    >
                      <img src={it.blobUrl || it.preview} alt={it.file.name} className="h-28 w-full object-cover" />
                    </button>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs font-medium">{it.file.name}</p>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
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
                        {it.status === "compressing" && (
                          <Badge className="gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> 压缩中
                          </Badge>
                        )}
                        {it.status === "error" && <span className="text-destructive">{it.error}</span>}
                        {it.status === "pending" && <span>等待中</span>}
                      </div>
                      {it.status === "compressing" && <Progress value={66} className="h-1" />}
                      <div className="flex items-center gap-1">
                        {it.status === "done" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => downloadOne(it)} className="h-7 px-2">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => copyOne(it)} className="h-7 px-2">
                              {copiedId === it.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        )}
                        {(it.status === "error" || it.status === "pending") && (
                          <Button size="sm" variant="ghost" onClick={() => compressOne(it.id, it, items.length === 1)} className="h-7 px-2">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeOne(it.id)} className="ml-auto h-7 px-2">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {crop && crop.width > 0 ? `已选 ${Math.round(crop.width)} × ${Math.round(crop.height)}` : "拖拽选区，不选则压缩原图"}
                  </p>
                  <Button size="sm" onClick={compressAll} disabled={singleItem.status === "compressing"}>
                    {singleItem.status === "compressing" ? "压缩中..." : "开始压缩"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
