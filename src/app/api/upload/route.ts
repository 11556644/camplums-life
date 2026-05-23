import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return apiError("请选择文件");

    // 严格 MIME 校验
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return apiError("仅支持 JPG/PNG/WebP/GIF 格式");

    // 大小校验
    if (file.size > MAX_SIZE) return apiError("文件大小不能超过 5MB");

    // Magic bytes 校验（前 4 字节）
    const buffer = Buffer.from(await file.arrayBuffer());
    const magic = buffer.slice(0, 4).toString("hex");
    const validMagic: Record<string, string[]> = {
      jpg: ["ffd8ffe0", "ffd8ffe1", "ffd8ffe2", "ffd8ffe8"],
      png: ["89504e47"],
      webp: ["52494646"], // RIFF
      gif: ["47494638"],
    };
    if (!validMagic[ext]?.some((m) => magic.startsWith(m.slice(0, 4)))) {
      return apiError("文件内容与扩展名不匹配");
    }

    // 安全文件名（纯随机，无用户输入）
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    return apiSuccess({ url: `/uploads/${filename}` });
  } catch {
    return apiError("上传失败", 500);
  }
}
