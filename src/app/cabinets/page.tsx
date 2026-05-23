"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CabinetQRScanner, PickupCodeDisplay } from "@/components/cabinet-qr";

const SLOT_STATUS: Record<string, { label: string; color: string }> = {
  empty: { label: "空闲", color: "bg-green-100 text-green-800" },
  occupied: { label: "已占用", color: "bg-red-100 text-red-800" },
  reserved: { label: "已预约", color: "bg-yellow-100 text-yellow-800" },
  fault: { label: "故障", color: "bg-gray-100 text-gray-600" },
};

interface Slot { id: string; slotNumber: number; status: string; }
interface Cabinet { id: string; name: string; location: string; totalSlots: number; status: string; slots: Slot[]; }

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("已过期"); setUrgent(true); return; }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setUrgent(hours < 12);
      if (hours > 24) setRemaining(`${Math.floor(hours / 24)}天${hours % 24}时`);
      else setRemaining(`${hours}时${mins}分`);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return <span className={urgent ? "text-red-600 font-bold animate-pulse" : "text-gray-500"}>剩余 {remaining}</span>;
}

export default function CabinetsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [lastPickupCode, setLastPickupCode] = useState<string | null>(null);
  const [depositPhoto, setDepositPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [myBindings, setMyBindings] = useState<{ id: string; pickupCode: string; status: string; expiresAt: string | null; depositType: string; slot: { slotNumber: number; cabinet: { name: string } }; photo: string | null }[]>([]);

  const refreshCabinets = async () => {
    const d = await fetch("/api/cabinets").then((r) => r.json());
    if (d.success) setCabinets(d.data);
  };

  const refreshMyBindings = async () => {
    if (!user) return;
    const d = await fetch("/api/cabinets/mine").then((r) => r.json()).catch(() => null);
    if (d?.success) setMyBindings(d.data);
  };

  useEffect(() => {
    refreshCabinets().then(() => setLoading(false));
    refreshMyBindings();
    const timer = setInterval(() => { refreshCabinets(); refreshMyBindings(); }, 5000);
    return () => clearInterval(timer);
  }, [user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) setDepositPhoto(data.data.url);
      else toast.error(data.error);
    } catch { toast.error("上传失败"); }
    setUploading(false);
  };

  const handleDeposit = async (slotId: string) => {
    if (!user) { router.push("/login"); return; }
    const res = await fetch("/api/cabinets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, depositType: "storage", fee: 5, photo: depositPhoto }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`存入成功！取件码：${data.data.pickupCode}`);
      setLastPickupCode(data.data.pickupCode);
      setSelectedSlot(null);
      setDepositPhoto(null);
      refreshCabinets();
      refreshMyBindings();
    } else {
      toast.error(data.error);
    }
  };

  const handleRetrieve = async (code: string, reject = false) => {
    if (!user) { router.push("/login"); return; }
    const res = await fetch("/api/cabinets/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickupCode: code, reject }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(reject ? "已拒收" : "取件成功！");
      setLastPickupCode(null);
      refreshCabinets();
      refreshMyBindings();
    } else {
      toast.error(data.error);
    }
  };

  const handleExpireCheck = async () => {
    const res = await fetch("/api/cabinets/expired", { method: "POST" });
    const data = await res.json();
    if (data.success) toast.success(data.data.message);
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">智能柜</h1>
        <div className="flex gap-2">
          {user?.roles?.includes("admin") && (
            <Button variant="outline" size="sm" onClick={handleExpireCheck}>检查过期</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：扫码/取件 + 我的寄存 */}
        <div className="space-y-4">
          <CabinetQRScanner onSuccess={() => { refreshCabinets(); refreshMyBindings(); }} />
          {lastPickupCode && <PickupCodeDisplay pickupCode={lastPickupCode} />}

          {/* 我的寄存记录 */}
          {myBindings.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">我的寄存</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {myBindings.map((b) => (
                  <div key={b.id} className="p-2 bg-gray-50 rounded text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b.slot.cabinet.name} #{b.slot.slotNumber}</span>
                      <Badge variant={b.status === "active" ? "default" : "secondary"}>
                        {b.status === "active" ? "待取" : b.status === "retrieved" ? "已取" : b.status === "expired" ? "已过期" : b.status}
                      </Badge>
                    </div>
                    <div className="text-gray-500">取件码：<span className="font-mono font-bold">{b.pickupCode}</span></div>
                    {b.expiresAt && b.status === "active" && <CountdownTimer expiresAt={b.expiresAt} />}
                    {b.photo && <img src={b.photo} alt="存入照片" className="w-full h-20 object-cover rounded mt-1" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：柜机列表 */}
        <div className="lg:col-span-2 space-y-6">
          {cabinets.map((cabinet) => (
            <Card key={cabinet.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{cabinet.name}</CardTitle>
                    <p className="text-sm text-gray-500">{cabinet.location}</p>
                  </div>
                  <Badge variant={cabinet.status === "online" ? "default" : "secondary"}>
                    {cabinet.status === "online" ? "在线" : "离线"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
                  {cabinet.slots.map((slot) => {
                    const info = SLOT_STATUS[slot.status] || SLOT_STATUS.empty;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => slot.status === "empty" && setSelectedSlot(slot.id)}
                        disabled={slot.status !== "empty"}
                        className={`
                          p-2 rounded-lg text-center text-xs font-medium border transition-all
                          ${slot.status === "empty" ? "hover:ring-2 hover:ring-blue-400 cursor-pointer" : "cursor-default"}
                          ${selectedSlot === slot.id ? "ring-2 ring-blue-500" : ""}
                          ${info.color}
                        `}
                      >
                        <div className="text-base font-bold">#{slot.slotNumber}</div>
                        <div>{info.label}</div>
                      </button>
                    );
                  })}
                </div>
                {selectedSlot && cabinet.slots.some((s) => s.id === selectedSlot) && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">已选择柜格，存入费用 ¥5/次</span>
                    </div>
                    {/* 存入拍照 */}
                    <div className="flex items-center gap-2">
                      <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? "上传中..." : "📷 存入拍照"}
                      </Button>
                      {depositPhoto && <span className="text-xs text-green-600">已拍照</span>}
                    </div>
                    {depositPhoto && <img src={depositPhoto} alt="存入照片" className="w-20 h-20 object-cover rounded" />}
                    <Button size="sm" onClick={() => handleDeposit(selectedSlot)}>确认存入</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
