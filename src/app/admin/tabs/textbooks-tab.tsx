"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TextbooksTab() {
  const [books, setBooks] = useState<Record<string, unknown>[]>([]);
  const [sanitizing, setSanitizing] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newBook, setNewBook] = useState({ title: "", author: "", isbn: "", publisher: "", originalPrice: "", course: "", copyCount: "2" });
  const [inspectCopyId, setInspectCopyId] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState("pass");
  const [inspectCondition, setInspectCondition] = useState("good");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/textbooks").then(r => r.json()),
      fetch("/api/textbooks/admin").then(r => r.json()),
    ]).then(([adminD, sanitizeD]) => {
      if (adminD.success) setBooks(adminD.data);
      if (sanitizeD.success) setSanitizing(sanitizeD.data);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAddBook = async () => {
    const res = await fetch("/api/admin/textbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newBook, originalPrice: parseFloat(newBook.originalPrice), copyCount: parseInt(newBook.copyCount) || 2 }),
    });
    const d = await res.json();
    if (d.success) {
      toast.success("书籍上架成功");
      setShowAdd(false);
      setNewBook({ title: "", author: "", isbn: "", publisher: "", originalPrice: "", course: "", copyCount: "2" });
      load();
    } else toast.error(d.error);
  };

  const handleUpdatePrice = async (id: string) => {
    const price = parseFloat(newPrice);
    if (!price || price <= 0) { toast.error("请输入有效价格"); return; }
    const res = await fetch("/api/admin/textbooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, originalPrice: price }),
    });
    const d = await res.json();
    if (d.success) { toast.success("原价已更新"); setEditingPriceId(null); load(); } else toast.error(d.error);
  };

  const handleToggleBook = async (id: string, action: "removed" | "active") => {
    const res = await fetch("/api/admin/textbooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: action }),
    });
    const d = await res.json();
    if (d.success) { toast.success(action === "removed" ? "已下架" : "已重新上架"); load(); } else toast.error(d.error);
  };

  const handleInspect = async (copyId: string, action: string) => {
    const res = await fetch("/api/textbooks/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copyId,
        ...(action === "sanitize" ? { sanitizeComplete: true, conditionAfter: inspectCondition } : { result: inspectResult, conditionAfter: inspectCondition }),
      }),
    });
    const d = await res.json();
    if (d.success) { toast.success(d.data.message || "操作成功"); setInspectCopyId(null); load(); } else toast.error(d.error);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">书籍管理（{books.length}本）</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? "取消" : "+ 上架新书"}</Button>
        </CardHeader>
        <CardContent>
          {showAdd && (
            <div className="mb-4 p-4 border rounded-lg bg-gray-50 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input placeholder="书名 *" value={newBook.title} onChange={e => setNewBook({ ...newBook, title: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="作者 *" value={newBook.author} onChange={e => setNewBook({ ...newBook, author: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="ISBN *" value={newBook.isbn} onChange={e => setNewBook({ ...newBook, isbn: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="出版社 *" value={newBook.publisher} onChange={e => setNewBook({ ...newBook, publisher: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="原价(元) *" type="number" value={newBook.originalPrice} onChange={e => setNewBook({ ...newBook, originalPrice: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="关联课程" value={newBook.course} onChange={e => setNewBook({ ...newBook, course: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="副本数" type="number" value={newBook.copyCount} onChange={e => setNewBook({ ...newBook, copyCount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              </div>
              <Button size="sm" onClick={handleAddBook}>确认上架</Button>
            </div>
          )}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {books.length === 0 ? (
              <p className="text-gray-400 text-center py-8">暂无书籍</p>
            ) : books.map(b => {
              const rp = b.rentalPrices as Record<string, number> | undefined;
              const isRemoved = (b.copies as { status: string }[])?.every(c => c.status === "retired") || false;
              return (
                <div key={String(b.id)} className={`p-3 border rounded-lg text-sm ${isRemoved ? "opacity-50 bg-gray-50" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{String(b.title)}</span>
                        <span className="text-xs text-gray-400">{String(b.author)}</span>
                        {String(b.course || "") && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{String(b.course)}</span>}
                        {isRemoved && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">已下架</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        ISBN: {String(b.isbn)} · 库存 {String(b.availableCount)}/{String(b.totalCount)} · 成色: {String(b.bestCondition || "-")}
                      </div>
                      {rp && (
                        <div className="text-xs mt-1.5 flex gap-3 flex-wrap">
                          <span className="text-gray-500">算法租赁价：</span>
                          <span>1月 <b className="text-blue-600">¥{rp.d30}</b></span>
                          <span>3月 <b className="text-blue-600">¥{rp.d90}</b></span>
                          <span>学期 <b className="text-blue-600">¥{rp.d120}</b></span>
                          <span>年 <b className="text-blue-600">¥{rp.d365}</b></span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {editingPriceId === String(b.id) ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-16 border rounded px-1 py-0.5 text-xs" placeholder="原价" />
                          <Button size="sm" className="h-6 text-xs" onClick={() => handleUpdatePrice(String(b.id))}>✓</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingPriceId(null)}>✕</Button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingPriceId(String(b.id)); setNewPrice(String(b.originalPrice || "")); }}
                          className="text-xs text-gray-500 hover:text-blue-600 border rounded px-2 py-0.5">
                          原价 ¥{String(b.originalPrice || "-")}
                        </button>
                      )}
                      {isRemoved ? (
                        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleToggleBook(String(b.id), "active")}>上架</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-xs text-red-600 border-red-200" onClick={() => handleToggleBook(String(b.id), "removed")}>下架</Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">待处理教材（{sanitizing.length}）</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {sanitizing.length === 0 ? (
              <p className="text-gray-400 text-center py-4">暂无待处理教材</p>
            ) : sanitizing.map(c => {
              const tb = c.textbook as Record<string, unknown>;
              const status = String(c.status);
              return (
                <div key={String(c.id)} className="p-3 border rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">{String(tb?.title || "")}</span>
                      <Badge className="ml-2" variant="outline">{String(c.copyNumber)}</Badge>
                      <Badge className="ml-1" variant={status === "sanitizing" ? "secondary" : "default"}>
                        {status === "sanitizing" ? "待消毒" : status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">当前成色：{String(c.condition)}</div>
                  {status === "sanitizing" && (
                    <div className="mt-2 space-y-2">
                      {inspectCopyId === c.id ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <select value={inspectCondition} onChange={e => setInspectCondition(e.target.value)} className="border rounded px-2 py-1 text-xs">
                            <option value="new">全新</option><option value="like_new">近新</option>
                            <option value="good">良好</option><option value="acceptable">可用</option>
                          </select>
                          <select value={inspectResult} onChange={e => setInspectResult(e.target.value)} className="border rounded px-2 py-1 text-xs">
                            <option value="pass">通过</option><option value="minor_damage">轻微损坏(¥10)</option>
                            <option value="major_damage">严重损坏(¥30)</option><option value="retired">报废(¥50)</option>
                          </select>
                          <Button size="sm" onClick={() => handleInspect(String(c.id), "inspect")}>质检</Button>
                          <Button size="sm" variant="outline" onClick={() => handleInspect(String(c.id), "sanitize")}>消毒完成上架</Button>
                          <Button size="sm" variant="ghost" onClick={() => setInspectCopyId(null)}>取消</Button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => setInspectCopyId(String(c.id))}>处理</Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
