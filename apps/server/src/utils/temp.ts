import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

export function getTempDir(): string {
  const dir = join(tmpdir(), "redon-compress");
  if (!existsSync(dir)) {
    // fire and forget; will be created on demand
  }
  return dir;
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
