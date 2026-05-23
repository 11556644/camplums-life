"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BorrowedCopy {
  id: string; copyNumber: string; condition: string; dueDate: string | null;
  isOverdue: boolean; overdueDays: number;
  textbook: { id: string; title: string; author: string; course: string | null };
}

export default function MyTextbooksPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [borrowing, setBorrowing] = useState<BorrowedCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch("/api/textbooks/my")
      .then(r => r.json())
      .then(d => {
        if (d.success) setBorrowing(d.data.borrowing);
        setLoading(false);
      });
  }, [user, router]);

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

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">我的教材</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : borrowing.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-2">暂无借阅中的教材</p>
          <Link href="/textbooks"><Button variant="outline">去订阅教材</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {borrowing.map((copy) => (
            <Card key={copy.id} className={copy.isOverdue ? "ring-2 ring-red-200" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      <Link href={`/textbooks/${copy.textbook.id}`} className="hover:text-blue-600">
                        {copy.textbook.title}
                      </Link>
                    </CardTitle>
                    <p className="text-sm text-gray-500">{copy.textbook.author}</p>
                    {copy.textbook.course && <p className="text-xs text-gray-400">{copy.textbook.course}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="outline">{copy.condition}</Badge>
                    {copy.isOverdue && <Badge className="bg-red-500">逾期 {copy.overdueDays} 天</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    <span className="font-mono text-xs">{copy.copyNumber}</span>
                    {copy.dueDate && (
                      <span className={`ml-3 ${copy.isOverdue ? "text-red-600 font-bold" : ""}`}>
                        应还：{new Date(copy.dueDate).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                  <Button size="sm" onClick={() => handleReturn(copy.id)} disabled={returning === copy.id}>
                    {returning === copy.id ? "归还中..." : "归还"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
