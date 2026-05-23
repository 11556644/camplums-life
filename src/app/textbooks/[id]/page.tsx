"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONDITION_LABELS: Record<string, string> = {
  new: "全新", like_new: "近新", good: "良好", acceptable: "可用", retired: "报废",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  available: { label: "可借", color: "bg-green-100 text-green-800" },
  borrowed: { label: "已借出", color: "bg-red-100 text-red-800" },
  sanitizing: { label: "消毒中", color: "bg-yellow-100 text-yellow-800" },
  retired: { label: "已报废", color: "bg-gray-100 text-gray-600" },
};

interface TextbookDetail {
  id: string; isbn: string; title: string; author: string; publisher: string;
  edition: string | null; course: string | null; department: string | null;
  semester: string | null; isRequired: boolean;
  copies: { id: string; copyNumber: string; condition: string; status: string; borrowerId: string | null; dueDate: string | null }[];
  statusCounts: Record<string, number>;
  conditionCounts: Record<string, number>;
  availableCount: number; totalCount: number;
}

export default function TextbookDetailPage() {
  const params = useParams();
  const [tb, setTb] = useState<TextbookDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/textbooks/${params.id}`).then(r => r.json()).then(d => {
      if (d.success) setTb(d.data);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!tb) return <div className="container mx-auto px-12 text-center text-gray-400">教材不存在</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl">{tb.title}</CardTitle>
            {tb.isRequired && <Badge>必修</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p><span className="text-gray-400">作者：</span>{tb.author}</p>
          <p><span className="text-gray-400">出版社：</span>{tb.publisher}</p>
          <p><span className="text-gray-400">ISBN：</span>{tb.isbn}</p>
          {tb.edition && <p><span className="text-gray-400">版本：</span>{tb.edition}</p>}
          {tb.course && <p><span className="text-gray-400">课程：</span>{tb.course}</p>}
          {tb.department && <p><span className="text-gray-400">院系：</span>{tb.department}</p>}
          {tb.semester && <p><span className="text-gray-400">学期：</span>{tb.semester}</p>}
        </CardContent>
      </Card>

      {/* 库存概览 */}
      <Card>
        <CardHeader><CardTitle className="text-lg">库存状态</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{tb.availableCount}</div>
              <div className="text-xs text-gray-500">可借</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{tb.statusCounts.borrowed || 0}</div>
              <div className="text-xs text-gray-500">已借出</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{tb.statusCounts.sanitizing || 0}</div>
              <div className="text-xs text-gray-500">消毒中</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{tb.totalCount}</div>
              <div className="text-xs text-gray-500">总计</div>
            </div>
          </div>

          {/* 成色分布 */}
          <h4 className="text-sm font-medium mb-2">成色分布</h4>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(tb.conditionCounts).map(([cond, count]) => (
              <Badge key={cond} variant="outline">{CONDITION_LABELS[cond] || cond}: {count}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 副本列表 */}
      <Card>
        <CardHeader><CardTitle className="text-lg">副本明细（{tb.copies.length}）</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tb.copies.map((copy) => {
              const stInfo = STATUS_LABELS[copy.status] || { label: copy.status, color: "bg-gray-100" };
              return (
                <div key={copy.id} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">{copy.copyNumber}</span>
                    <Badge variant="outline">{CONDITION_LABELS[copy.condition] || copy.condition}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={stInfo.color}>{stInfo.label}</Badge>
                    {copy.dueDate && copy.status === "borrowed" && (
                      <span className="text-xs text-gray-400">
                        应还：{new Date(copy.dueDate).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
