"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface WalletData {
  id: string;
  balance: number;
  frozen: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    method: string | null;
    orderId: string | null;
    status: string;
    createdAt: string;
  }>;
}

const TX_LABELS: Record<string, { label: string; color: string }> = {
  topup: { label: "充值", color: "text-green-600" },
  pay: { label: "支付", color: "text-red-600" },
  refund: { label: "退款", color: "text-blue-600" },
  settlement: { label: "结算收入", color: "text-emerald-600" },
};

const METHOD_LABELS: Record<string, string> = {
  wechat: "微信",
  alipay: "支付宝",
  wallet: "钱包",
};

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("50");
  const [topupMethod, setTopupMethod] = useState<"wechat" | "alipay">("wechat");
  const [topping, setTopping] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetchWallet();
  }, [user, router]);

  const fetchWallet = async () => {
    const res = await fetch("/api/wallet");
    const data = await res.json();
    if (data.success) setWallet(data.data);
    setLoading(false);
  };

  const ALLOWED_TOPUP = [10, 20, 50, 100, 200, 500];

  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) { toast.error("请输入有效金额"); return; }
    if (!ALLOWED_TOPUP.includes(amount)) { toast.error(`仅支持 ${ALLOWED_TOPUP.join(", ")} 元`); return; }
    setTopping(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "topup", amount, method: topupMethod }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`充值成功！余额：¥${data.data.balance}`);
        fetchWallet();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("充值失败");
    } finally {
      setTopping(false);
    }
  };

  if (!user || loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">我的钱包</h1>

      {/* 余额卡片 */}
      <Card className="mb-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <CardContent className="pt-6">
          <div className="text-sm opacity-80 mb-1">钱包余额</div>
          <div className="text-4xl font-bold mb-4">¥{wallet?.balance.toFixed(2) || "0.00"}</div>
          <div className="flex gap-4 text-sm opacity-70">
            <span>冻结：¥{wallet?.frozen.toFixed(2) || "0.00"}</span>
          </div>
        </CardContent>
      </Card>

      {/* 充值 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">充值</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-6 gap-2">
            {["10", "20", "50", "100", "200", "500"].map((amt) => (
              <button
                key={amt}
                onClick={() => setTopupAmount(amt)}
                className={`py-2 rounded-lg text-sm font-medium border ${topupAmount === amt ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200"}`}
              >
                ¥{amt}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>自定义金额</Label>
            <Input
              type="number"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="输入金额"
              min="1"
            />
          </div>
          <div className="space-y-2">
            <Label>支付方式</Label>
            <div className="flex gap-3">
              <button
                onClick={() => setTopupMethod("wechat")}
                className={`flex-1 p-3 rounded-lg border-2 text-center ${topupMethod === "wechat" ? "border-green-500 bg-green-50" : "border-gray-200"}`}
              >
                <div className="text-lg">💚</div>
                <div className="text-sm font-medium">微信支付</div>
              </button>
              <button
                onClick={() => setTopupMethod("alipay")}
                className={`flex-1 p-3 rounded-lg border-2 text-center ${topupMethod === "alipay" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <div className="text-lg">💙</div>
                <div className="text-sm font-medium">支付宝</div>
              </button>
            </div>
          </div>
          <Button className="w-full" onClick={handleTopup} disabled={topping}>
            {topping ? "充值中..." : `充值 ¥${topupAmount}`}
          </Button>
          <p className="text-xs text-center text-gray-400">演示模式：点击即充值成功</p>
        </CardContent>
      </Card>

      {/* 交易记录 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">交易记录</CardTitle>
        </CardHeader>
        <CardContent>
          {wallet?.transactions.length === 0 ? (
            <p className="text-center text-gray-400 py-4">暂无交易</p>
          ) : (
            <div className="space-y-3">
              {wallet?.transactions.map((tx) => {
                const info = TX_LABELS[tx.type] || { label: tx.type, color: "text-gray-600" };
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={info.color}>{info.label}</Badge>
                        {tx.method && <span className="text-xs text-gray-400">{METHOD_LABELS[tx.method] || tx.method}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(tx.createdAt).toLocaleString("zh-CN")}
                        {tx.orderId && (
                          <Link href={`/orders/${tx.orderId}`} className="ml-2 text-blue-500 hover:underline">查看订单</Link>
                        )}
                      </div>
                    </div>
                    <div className={`text-right font-medium ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
