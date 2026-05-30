"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

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
  originalPrice?: number | null;
  bestCondition?: string;
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
  freeLateDays?: number;
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
  const [tab, setTab] = useState<"textbook" | "extracurricular">("textbook");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [rentalDays, setRentalDays] = useState(120);

  const RENTAL_OPTIONS = [
    { days: 30, label: "1个月", multiplier: 0.35 },
    { days: 90, label: "1学期", multiplier: 0.75 },
    { days: 120, label: "标准学期", multiplier: 1.0 },
    { days: 365, label: "1学年", multiplier: 1.6 },
  ];

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
    if (!silent) setLoading(false);
  }, [searchQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE：教材借还时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "textbook") fetchData(true);
  }, [fetchData]);
  useRealtime(handleRealtime, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const basePlanPrice = plans.length > 0 ? Math.ceil(plans[0].price / plans[0].maxBooks) : 30;

  // 每本书独立计价（原价 × 租期费率 × 成色系数）
  const COND_MULT: Record<string, number> = { new: 1.0, like_new: 0.85, good: 0.70, acceptable: 0.55 };
  const COND_LABEL: Record<string, string> = { new: "全新", like_new: "九成新", good: "良好", acceptable: "可接受" };

  const getBookPrice = (tb: Textbook) => {
    if (selectedPlan) return basePlanPrice;
    const orig = tb.originalPrice || 50;
    const cond = tb.bestCondition || "good";
    // 分段日费率递减
    let remaining = rentalDays;
    let total = 0;
    const tiers = [
      { days: 30, rate: 0.005 },
      { days: 60, rate: 0.003 },
      { days: 30, rate: 0.002 },
      { days: 245, rate: 0.001 },
    ];
    for (const t of tiers) {
      if (remaining <= 0) break;
      const d = Math.min(remaining, t.days);
      total += orig * t.rate * d;
      remaining -= d;
    }
    if (remaining > 0) total += orig * 0.0008 * remaining;
    const base = Math.max(1, Math.round(total));
    return Math.min(Math.round(base * (COND_MULT[cond] || 0.70)), orig);
  };

  const totalItems = Object.values(selected).reduce((s, n) => s + n, 0);
  const deposit = selectedPlan ? (plans.find(p => p.id === selectedPlan)?.deposit || 0) : 0;
  const totalPrice = textbooks
    .filter(tb => selected[tb.id])
    .reduce((sum, tb) => sum + getBookPrice(tb) * (selected[tb.id] || 0), 0)
    + deposit;

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
    if (totalItems === 0) { toast.error("请选择至少一本书"); return; }

    setSubmitting(true);
    try {
      const items = Object.entries(selected).map(([textbookId, quantity]) => ({ textbookId, quantity }));
      const res = await fetch("/api/textbooks/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          rentalDays,
          ...(selectedPlan ? { planId: selectedPlan } : {}),
          deliveryType,
          ...(deliveryType === "cabinet" ? { cabinetSlotId } : { dormitory, floor, roomNumber }),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("借阅下单成功，请前往订单页面支付");
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
        <h1 className="text-2xl font-bold">书籍中心</h1>
        <div className="flex gap-3">
          <Link href="/textbooks/my" className="text-blue-600 hover:underline text-sm">我的借阅</Link>
          <Link href="/subscriptions/my" className="text-blue-600 hover:underline text-sm">我的订阅</Link>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="搜索书名、作者、ISBN、课程..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">搜索</button>
        {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setSearchInput(""); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">清除</button>}
      </form>

      {/* 分类切换 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("textbook")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === "textbook" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          课程教材
        </button>
        <button
          onClick={() => setTab("extracurricular")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === "extracurricular" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          经典读物
        </button>
      </div>

      {/* 租期选择 */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">选择借阅时长</h3>
        <div className="flex gap-2 flex-wrap">
          {RENTAL_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setRentalDays(opt.days)}
              className={`px-4 py-2 rounded-lg border-2 text-sm transition ${rentalDays === opt.days ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}
            >
              {opt.label}
              <span className="block text-xs text-gray-400">{opt.days}天</span>
            </button>
          ))}
        </div>
      </div>

      {/* 订阅套餐选择（仅课程教材） */}
      {tab === "textbook" && plans.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">选择订阅套餐（可选，含免费宽限期）</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setSelectedPlan("")}
              className={`p-3 rounded-lg border-2 text-left text-sm ${!selectedPlan ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
            >
              <div className="font-medium">按本借阅</div>
              <div className="text-xs text-gray-500">灵活选书，按本计费</div>
            </button>
            {plans.map((p: Plan) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`p-3 rounded-lg border-2 text-left text-sm ${selectedPlan === p.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="font-medium">{p.name || `套餐（${p.maxBooks}本）`}</div>
                <div className="text-xs text-gray-500">¥{p.price} + 押金 ¥{p.deposit} · 最多{p.maxBooks}本 · 宽限{(p.freeLateDays ?? 3)}天</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 书籍列表 - 可多选 */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-1">{tab === "textbook" ? "选择教材" : "经典读物"}</h2>
        <p className="text-xs text-gray-400 mb-4">租期{rentalDays}天 · 按书定价 · 逾期 ¥2/天</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {textbooks.filter(tb => tab === "textbook" ? tb.course : !tb.course).map((tb) => {
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
                    <span className="font-bold text-blue-600">¥{getBookPrice(tb)}<span className="text-xs text-gray-400 font-normal">/{rentalDays}天</span></span>
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

      {/* 借阅栏 */}
      {totalItems > 0 && (
        <div className="sticky bottom-0 bg-white border-t p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">已选 {totalItems} 本 · 租期 {rentalDays} 天</span>
              <span className="ml-4 text-xl font-bold text-red-600">¥{totalPrice}</span>
              {deposit > 0 && <span className="ml-1 text-xs text-gray-400">（含押金 ¥{deposit}）</span>}
            </div>
            <Button size="lg" onClick={handlePurchase} disabled={submitting}>
              {submitting ? "提交中..." : "确认借阅"}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            借阅后 {rentalDays} 天内归还，逾期按 ¥2/天 收取费用 · 支持续借 · 归还后押金原路退回
          </p>
        </div>
      )}

      {/* 租借规则说明 */}
      <Card className="mt-6 bg-blue-50/50 border-blue-100">
        <CardContent className="text-sm text-gray-600 space-y-2 py-4">
          <p className="font-medium text-gray-800">📖 借阅规则</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <p>• 选书后选择借阅时长，费用按时长按比例计算</p>
            <p>• 选择订阅套餐可享免费宽限期（逾期不计费）</p>
            <p>• 支持续借：1个月/1学期/标准学期，费用按比例收取</p>
            <p>• 逾期费 ¥2/天，同时扣除信用分 2 分/次</p>
            <p>• 归还后书籍进入消毒流程，1-2 个工作日重新上架</p>
            <p>• 押金在全部归还后原路退回</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
