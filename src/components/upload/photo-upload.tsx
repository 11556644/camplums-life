"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface PhotoUploadProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export function PhotoUpload({ photos, onChange, maxPhotos = 5 }: PhotoUploadProps) {
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addByUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (photos.length >= maxPhotos) {
      toast.error(`最多上传 ${maxPhotos} 张照片`);
      return;
    }
    onChange([...photos, url]);
    setUrlInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (photos.length + files.length > maxPhotos) {
      toast.error(`最多上传 ${maxPhotos} 张照片`);
      return;
    }

    setUploading(true);
    const newPhotos = [...photos];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          newPhotos.push(data.data.url);
        } else {
          toast.error(`${file.name}: ${data.error}`);
        }
      } catch {
        toast.error(`${file.name}: 上传失败`);
      }
    }

    onChange(newPhotos);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* 文件上传 */}
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || photos.length >= maxPhotos}
        >
          {uploading ? "上传中..." : "上传图片"}
        </Button>
        <span className="text-xs text-gray-400 self-center">支持 JPG/PNG/WebP，最大 5MB</span>
      </div>

      {/* URL 输入 */}
      <div className="flex gap-2">
        <Input
          placeholder="或粘贴图片 URL"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addByUrl()}
        />
        <Button type="button" variant="outline" onClick={addByUrl}>添加</Button>
      </div>

      {/* 照片预览 */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                alt={`照片 ${i + 1}`}
                className="w-full aspect-square object-cover rounded-lg border"
                onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23ccc'%3E图片加载失败%3C/text%3E%3C/svg%3E"; }}
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        上传本地图片或粘贴图片链接（最多 {maxPhotos} 张）
      </p>
    </div>
  );
}
