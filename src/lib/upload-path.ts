import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const isProd = process.env.NODE_ENV === "production";

export function getUploadDir(): string {
  const dir = isProd
    ? join(process.cwd(), "data", "uploads")
    : join(process.cwd(), "public", "uploads");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getUploadUrl(filename: string): string {
  if (isProd) {
    return `/api/uploads/${filename}`;
  }
  return `/uploads/${filename}`;
}
