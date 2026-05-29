"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Textbook {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  edition: string | null;
  course: string | null;
  department: string | null;
  isRequired: boolean;
  availableCount: number;
  totalCount: number;
}

interface Cabinet {
  id: string;
  name: string;
  location: string;
  slots: Array<{ id: string; slotNumber: number; status: string }>;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  deposit: number;
  maxBooks: number;
  description: string | null;
}

export default function TextbooksPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [deliveryType, setDeliveryType] = useState<"cabinet" | "dormitory">("cabinet");
  const [cabinetSlotId, setCabinetSlotId] = useState("");
  const [dormitory, setDormitory] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      const tbUrl = searchQuery ? `/api/textbooks?q=${encodeURIComponent(searchQuery)}` : "/api/textbooks";
      const [tbRes, cabRes, planRes] = await Promise.all([
        fetch(tbUrl),
        fetch("/api/cabinets"),
        fetch("/api/subscriptions"),
      ]);
      const [tbData, cabData, planData] = await Promise.all([tbRes.json(), cabRes.json(), planRes.json()]);
      if (tbData.success) setTextbooks(tbData.data);
      if (cabData.success) setCabinets(cabData.data);
      if (planData.success) setPlans(planData.data);
      setLoading(false);
    };
    fetchData();
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const unitPrice = plans.length > 0 ? Math.ceil(plans[0].price / plans[0].maxBooks) : 30;
  const totalItems = Object.values(selected).reduce((s, n) => s + n, 0);
  const totalPrice = totalItems * unitPrice;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
  };

  const handlePurchase = async () => {
    if (!user) { router.push("/login"); return; }
    if (totalItems === 0) { toast.error("请选择至少一本教材"); return; }

    setSubmitting(true);
    try {
      const items = Object.entries(selected).map(([textbookId, quantity]) => ({ textbookId, quantity }));
      const res = await fetch("/api/textbooks/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          ...(selectedPlan ? { planId: selectedPlan } : {}),
          deliveryType,
          ...(deliveryType === "cabinet" ? { cabinetSlotId } : { dormitory, floor, roomNumber }),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("下单成功，请前往订单页面支付");
        router.push("/orders");
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("下单失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;

  const emptySlots = cabinets.flatMap((c) =>
    c.slots.filter((s) => s.status === "empty").map((s) => ({ ...s, cabinetName: c.name, cabinetLocation: c.location }))
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">书籍/教材中心</h1>
        <div className="flex gap-3">
          <Link href="/textbooks/my" className="text-blue-600 hover:underline text-sm">我的教材</Link>
          <Link href="/subscriptions/my" className="text-blue-600 hover:underline text-sm">我的订阅</Link>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="搜索教材名称、作者、ISBN、课程..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">搜索</button>
        {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setSearchInput(""); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">清除</button>}
      </form>

      {/* 订阅套餐选择（可选） */}
      {plans.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">选择订阅套餐（可选，不选则按本计费）</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setSelectedPlan("")}
              className={`p-3 rounded-lg border-2 text-left text-sm ${!selectedPlan ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
            >
              <div className="font-medium">按本购买</div>
              <div className="text-xs text-gray-500">灵活选购，按本计费</div>
            </button>
            {plans.map((p: Plan) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`p-3 rounded-lg border-2 text-left text-sm ${selectedPlan === p.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="font-medium">{p.name || `套餐（${p.maxBooks}本）`}</div>
                <div className="text-xs text-gray-500">¥{p.price} + 押金 ¥{p.deposit} · 最多{p.maxBooks}本</div>
              </button>
            ))}
          </div>
          {selectedPlan && (
            <p className="text-xs text-blue-600 mt-2">已选套餐，学期末统一归还，逾期按 ¥2/天计费</p>
          )}
        </div>
      )}

      {/* 教材列表 - 可多选 */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">选择教材（单价 ¥{unitPrice}/本）</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {textbooks.map((tb) => {
            const isSelected = !!selected[tb.id];
            const canSelect = tb.availableCount > 0;
            return (
              <Card
                key={tb.id}
                className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500 bg-blue-50" : canSelect ? "hover:shadow-md" : "opacity-50"}`}
                onClick={() => canSelect && toggleSelect(tb.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm line-clamp-1">{tb.title}</CardTitle>
                    <div className="flex gap-1">
                      {tb.isRequired && <Badge className="shrink-0">必修</Badge>}
                      {isSelected && <Badge className="bg-blue-500 shrink-0">已选</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-gray-600 space-y-1">
                  <p>{tb.author} · {tb.publisher}</p>
                  {tb.course && <p>课程：{tb.course}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${tb.availableCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      库存 {tb.availableCount}/{tb.totalCount}
                    </span>
                    <span className="font-bold text-blue-600">¥{unitPrice}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 配送方式 */}
      {totalItems > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">配送方式</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => setDeliveryType("cabinet")}
                className={`flex-1 p-4 rounded-lg border-2 text-center ${deliveryType === "cabinet" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <div className="text-2xl mb-1">🔐</div>
                <div className="font-medium">智能柜自取</div>
                <div className="text-xs text-gray-500">取件码开柜</div>
              </button>
              <button
                onClick={() => setDeliveryType("dormitory")}
                className={`flex-1 p-4 rounded-lg border-2 text-center ${deliveryType === "dormitory" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <div className="text-2xl mb-1">🏠</div>
                <div className="font-medium">宿舍配送</div>
                <div className="text-xs text-gray-500">送到宿舍门口</div>
              </button>
            </div>

            {deliveryType === "cabinet" && (
              <div className="space-y-2">
                <Label>选择柜格</Label>
                <select
                  value={cabinetSlotId}
                  onChange={(e) => setCabinetSlotId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">请选择柜格</option>
                  {emptySlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.cabinetName} #{s.slotNumber}（{s.cabinetLocation}）
                    </option>
                  ))}
                </select>
              </div>
            )}

            {deliveryType === "dormitory" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>宿舍楼</Label>
                  <Input value={dormitory} onChange={(e) => setDormitory(e.target.value)} placeholder="如：1号楼" />
                </div>
                <div className="space-y-1">
                  <Label>楼层</Label>
                  <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="如：3" />
                </div>
                <div className="space-y-1">
                  <Label>房间号</Label>
                  <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="如：301" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 购买栏 */}
      {totalItems > 0 && (
        <div className="sticky bottom-0 bg-white border-t p-4 flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">已选 {totalItems} 本</span>
            <span className="ml-4 text-xl font-bold text-red-600">¥{totalPrice}</span>
          </div>
          <Button size="lg" onClick={handlePurchase} disabled={submitting}>
            {submitting ? "提交中..." : "立即购买"}
          </Button>
        </div>
      )}
    </div>
  );
}
