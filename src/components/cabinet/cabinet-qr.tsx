"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import jsQR from "jsqr";

interface CabinetQRScannerProps {
  onSuccess?: (data: { slotInfo?: string }) => void;
}

export function CabinetQRScanner({ onSuccess }: CabinetQRScannerProps) {
  const [mode, setMode] = useState<"scan" | "manual">("manual");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const handleOpenRef = useRef<(code: string, reject?: boolean) => Promise<void>>(undefined);

  // handleOpen 用 ref 保持最新引用
  const handleOpen = useCallback(async (pickupCode: string, reject = false) => {
    if (!pickupCode.trim()) { toast.error("请输入取件码"); return; }
    setScanning(true);
    try {
      const res = await fetch("/api/cabinets/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupCode: pickupCode.trim(), reject }),
      });
      const data = await res.json();
      if (data.success) {
        if (reject) {
          toast.success("已拒收，订单已转为纠纷");
        } else {
          toast.success("柜门已打开，请取出物品");
          setShowReject(true);
          setLastCode(pickupCode.trim());
        }
        setCode("");
        onSuccess?.(data.data);
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setScanning(false);
    }
  }, [onSuccess]);

  useEffect(() => { handleOpenRef.current = handleOpen; }, [handleOpen]);

  // QR 解码循环（稳定引用，不依赖渲染）
  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (qr && qr.data) {
      setCode(qr.data);
      handleOpenRef.current?.(qr.data);
      return;
    }
    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, []);

  useEffect(() => {
    if (mode !== "scan") return;
    let active = true;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("浏览器不支持摄像头访问（需 HTTPS）");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const startScan = () => { animFrameRef.current = requestAnimationFrame(scanFrame); };
          videoRef.current.onloadeddata = startScan;
          try { await videoRef.current.play(); } catch { /* autoplay blocked, onloadeddata will fire */ }
        }
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError"
          ? "摄像头权限被拒绝，请在浏览器设置中开启"
          : err?.name === "NotFoundError"
            ? "未检测到摄像头设备"
            : `摄像头不可用：${err?.message || "未知错误"}`;
        setMode("manual");
        toast.error(msg);
      }
    };

    startCamera();
    return () => {
      active = false;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [mode, scanFrame]);

  const handleReject = () => {
    if (lastCode) handleOpen(lastCode, true);
    setShowReject(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">扫码/输码开柜</CardTitle>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => { setMode("scan"); setShowReject(false); streamRef.current?.getTracks().forEach(t => t.stop()); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${mode === "scan" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
            >扫码</button>
            <button
              onClick={() => { setMode("manual"); setShowReject(false); cancelAnimationFrame(animFrameRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${mode === "manual" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
            >手动输入</button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "scan" ? (
          <div className="space-y-3">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-400 rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-400 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-400 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-blue-400 rounded-br" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Input placeholder="或手动输入取件码" value={code} onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOpen(code)} maxLength={8} />
              <Button onClick={() => handleOpen(code)} disabled={scanning}>{scanning ? "开柜中..." : "开柜"}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-center text-sm text-gray-500 mb-2">输入取件码即可打开对应柜格</div>
            <Input placeholder="请输入6位取件码" value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpen(code)}
              maxLength={8} className="text-center text-xl tracking-[0.3em] font-mono h-12" />
            <Button className="w-full h-11 text-base" onClick={() => handleOpen(code)} disabled={scanning}>
              {scanning ? "正在开柜..." : "开柜取件"}
            </Button>
          </div>
        )}

        {showReject && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2">已取件。如果商品有问题，可以选择拒收：</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={handleReject}>拒收</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>确认收货</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PickupCodeDisplay({ pickupCode }: { pickupCode: string; slotInfo?: string }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // 客户端生成 QR 码（不依赖外部服务，中国网络友好）
  useEffect(() => {
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(pickupCode, { width: 200, margin: 1 }).then(setQrDataUrl);
    }).catch(() => {
      // fallback: 无 QR 码时只显示取件码
    });
  }, [pickupCode]);

  const copyCode = () => {
    navigator.clipboard.writeText(pickupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-base">取件信息</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-3">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="取件码" className="mx-auto w-36 h-36" />
        ) : (
          <div className="mx-auto w-36 h-36 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">生成中...</div>
        )}
        <div>
          <div className="text-3xl font-bold tracking-[0.3em] text-blue-600 font-mono">{pickupCode}</div>
          <button onClick={copyCode} className="text-xs text-blue-500 mt-1 hover:underline">
            {copied ? "已复制!" : "复制取件码"}
          </button>
        </div>
        <Badge variant="outline" className="text-xs">分享此取件码给取件人</Badge>
      </CardContent>
    </Card>
  );
}
