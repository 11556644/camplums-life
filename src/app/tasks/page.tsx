"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TASK_TYPE_LABELS } from "@/lib/constants";
import { InlineLoader } from "@/components/skeletons";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";
import { useDebounce } from "@/hooks/use-debounce";

interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  budget: number | null;
  budgetType: string;
  status: string;
  location: string | null;
  publisher: { id: string; nickname: string; dormitory: string | null };
  createdAt: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("type", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    if (data.success) setTasks(data.data.tasks);
    if (!silent) setLoading(false);
  }, [category, debouncedSearch]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // SSE：任务变更时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "task") fetchTasks(true);
  }, [fetchTasks]);
  useRealtime(handleRealtime, [fetchTasks]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">自由市场</h1>
        <Link href="/tasks/publish" className="text-blue-600 hover:underline">发布任务</Link>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索任务..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {searchInput && <button type="button" onClick={() => setSearchInput("")} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">清除</button>}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategory("")}
          className={`px-3 py-1 rounded-full text-sm ${!category ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          全部
        </button>
        {Object.entries(TASK_TYPE_LABELS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1 rounded-full text-sm ${category === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <InlineLoader />
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无任务</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-1">{t.title}</CardTitle>
                    <Badge variant="secondary" className="ml-2 shrink-0">{TASK_TYPE_LABELS[t.type]?.label || t.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{t.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-orange-600">
                      {t.budget ? `¥${t.budget}` : "面议"}
                    </span>
                    <span className="text-xs text-gray-400">{t.publisher.dormitory || "未知"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
