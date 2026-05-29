"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BorrowedCopy {
  id: string; copyNumber: string; condition: string; dueDate: string | null;
  isOverdue: boolean; overdueDays: number; remainingDays: number;
  textbook: { id: string; title: string; author: string; course: string | null; isRequired: boolean };
}

const CONDITION_LABELS: Record<string, string> = {
  new: "全新", like_new: "九成新", good: "良好", acceptable: "可接受",
};

function getCountdownColor(remainingDays: number, isOverdue: boolean): string {
  if (isOverdue) return "text-red-600";
  if (remainingDays <= 7) return "text-red-500";
  if (remainingDays <= 14) return "text-amber-500";
  return "text-green-600";
}

function getProgressColor(remainingDays: number, isOverdue: boolean): string {
  if (isOverdue) return "bg-red-500";
  if (remainingDays <= 7) return "bg-red-400";
  if (remainingDays <= 14) return "bg-amber-400";
  return "bg-green-400";
}

function CountdownBar({ dueDate, totalDays = 120 }: { dueDate: string; totalDays?: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const due = new Date(dueDate).getTime();
  const remaining = due - now;
  const remainingDays = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  const isOverdue = remaining < 0;
  const elapsed = totalDays - remainingDays;
  const progress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={getCountdownColor(remainingDays, isOverdue)}>
          {isOverdue ? `已逾期 ${Math.abs(remainingDays)} 天` : `剩余 ${remainingDays} 天`}
        </span>
        <span className="text-gray-400">
          {new Date(dueDate).toLocaleDateString("zh-CN")}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getProgressColor(remainingDays, isOverdue)}`}
          style={{ width: `${isOverdue ? 100 : progress}%` }}
        />
      </div>
    </div>
  );
}

export default function MyTextbooksPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [borrowing, setBorrowing] = useState<BorrowedCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [showRenew, setShowRenew] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!user) return;
    fetch("/api/textbooks/my")
      .then(r => r.json())
      .then(d => {
        if (d.success) setBorrowing(d.data.borrowing);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetchData();
  }, [user, router, fetchData]);

  const handleReturn = async (copyId: string) => {
    setReturning(copyId);
    const res = await fetch("/api/textbooks/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(data.data.message);
      if (data.data.lateFee > 0) toast.info(`逾期费：¥${data.data.lateFee}`);
      setBorrowing(prev => prev.filter(b => b.id !== copyId));
    } else {
      toast.error(data.error);
    }
    setReturning(null);
  };

  const handleRenew = async (copyId: string, extendDays: number) => {
    setRenewing(copyId);
    const res = await fetch("/api/textbooks/renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId, extendDays }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(data.data.message);
      setShowRenew(null);
      fetchData();
    } else {
      toast.error(data.error);
    }
    setRenewing(null);
  };

  if (!user) return null;

  const overdueCount = borrowing.filter(b => b.isOverdue).length;
  const urgentCount = borrowing.filter(b => !b.isOverdue && b.remainingDays <= 7).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的借阅</h1>
        <Link href="/textbooks" className="text-blue-600 hover:underline text-sm">去借书</Link>
      </div>

      {/* 提醒横幅 */}
      {!loading && (overdueCount > 0 || urgentCount > 0) && (
        <div className={`mb-4 p-3 rounded-lg border ${overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="text-sm font-medium">
            {overdueCount > 0
              ? `⚠️ 您有 ${overdueCount} 本书已逾期，请尽快归还以避免持续产生逾期费`
              : `⏰ 您有 ${urgentCount} 本书即将到期（7天内），请及时归还或续借`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : borrowing.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📚</p>
          <p className="mb-2">暂无借阅中的书籍</p>
          <Link href="/textbooks"><Button variant="outline">去借书</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center py-3"><CardContent><div className="text-2xl font-bold text-blue-600">{borrowing.length}</div><div className="text-xs text-gray-500">借阅中</div></CardContent></Card>
            <Card className="text-center py-3"><CardContent><div className="text-2xl font-bold text-amber-500">{urgentCount}</div><div className="text-xs text-gray-500">即将到期</div></CardContent></Card>
            <Card className="text-center py-3"><CardContent><div className="text-2xl font-bold text-red-500">{overdueCount}</div><div className="text-xs text-gray-500">已逾期</div></CardContent></Card>
          </div>

          {borrowing.map((copy) => (
            <Card key={copy.id} className={copy.isOverdue ? "ring-2 ring-red-200" : copy.remainingDays <= 7 ? "ring-1 ring-amber-200" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">
                      <Link href={`/textbooks/${copy.textbook.id}`} className="hover:text-blue-600">
                        {copy.textbook.title}
                      </Link>
                    </CardTitle>
                    <p className="text-sm text-gray-500">{copy.textbook.author}</p>
                    <div className="flex gap-2 mt-1">
                      {copy.textbook.course && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{copy.textbook.course}</span>}
                      {copy.textbook.isRequired && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded">必修</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-xs">{CONDITION_LABELS[copy.condition] || copy.condition}</Badge>
                    {copy.isOverdue && <Badge className="bg-red-500">逾期 {copy.overdueDays} 天</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 倒计时进度条 */}
                {copy.dueDate && (
                  <CountdownBar dueDate={copy.dueDate} />
                )}

                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-400">{copy.copyNumber}</span>
                  <div className="flex gap-2">
                    {/* 续借按钮 */}
                    {!copy.isOverdue && (
                      <div className="relative">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setShowRenew(showRenew === copy.id ? null : copy.id)}
                          disabled={renewing === copy.id}
                        >
                          续借
                        </Button>
                        {showRenew === copy.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg p-2 z-10 w-40">
                            {[
                              { days: 30, label: "1个月", price: "30%" },
                              { days: 90, label: "1学期", price: "65%" },
                              { days: 120, label: "标准学期", price: "85%" },
                            ].map(opt => (
                              <button
                                key={opt.days}
                                onClick={() => handleRenew(copy.id, opt.days)}
                                className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
                              >
                                {opt.label} <span className="text-gray-400 text-xs">({opt.price})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant={copy.isOverdue ? "default" : "outline"}
                      onClick={() => handleReturn(copy.id)}
                      disabled={returning === copy.id}
                    >
                      {returning === copy.id ? "归还中..." : "归还"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* 归还说明 */}
          <Card className="bg-gray-50">
            <CardContent className="text-xs text-gray-500 space-y-1 py-4">
              <p>📌 归还后书籍进入消毒流程，预计 1-2 个工作日重新上架</p>
              <p>⏰ 逾期将按 ¥2/天 收取费用，并扣除信用分 2 分</p>
              <p>🎁 每次借阅享有免费宽限期（详见订阅套餐），宽限期内归还不计逾期</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
