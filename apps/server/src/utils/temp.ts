import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

export function getTempDir(): string {
  return join(tmpdir(), "redon-compress");
}

export async function cleanupStaleTemp(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  const dir = getTempDir();
  if (!existsSync(dir)) return;
  try {
    const files = await readdir(dir, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      files.map(async (entry) => {
        if (!entry.isFile()) return;
        const full = join(dir, entry.name);
        try {
          const info = await stat(full);
          if (now - info.mtimeMs > maxAgeMs) await unlink(full);
        } catch {
          // ignore
        }
      })
    );
  } catch {
    // ignore
  }
}

export async function ensureTempDir(): Promise<string> {
  const dir = getTempDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function tempPath(ext: string = ""): string {
  return join(getTempDir(), `${randomUUID()}${ext}`);
}

export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore
  }
}

export async function cleanupFiles(...paths: (string | undefined)[]): Promise<void> {
  await Promise.all(paths.filter(Boolean).map((p) => safeUnlink(p as string)));
}
