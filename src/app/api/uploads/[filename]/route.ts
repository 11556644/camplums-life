import { readFile, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getUploadDir } from "@/lib/upload-path";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 防止路径遍历
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return new Response("Bad Request", { status: 400 });
  }

  const uploadDir = getUploadDir();
  const filePath = join(uploadDir, filename);

  if (!existsSync(filePath)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);
    const fileStat = await stat(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(fileStat.size),
      },
    });
  } catch {
    return new Response("Internal Error", { status: 500 });
  }
}
