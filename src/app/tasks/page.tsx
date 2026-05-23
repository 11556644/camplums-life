"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TASK_TYPES: Record<string, string> = {
  errand: "跑腿",
  delivery: "代取",
  tutoring: "辅导",
  skill_exchange: "技能交换",
  repair: "维修",
  other: "其他",
};

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
  const [type, setType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      if (data.success) setTasks(data.data.tasks);
      setLoading(false);
    };
    fetchTasks();
  }, [type, searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">自由市场</h1>
        <Link href="/tasks/publish" className="text-blue-600 hover:underline">发布任务</Link>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索任务..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">搜索</button>
        {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setSearchInput(""); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">清除</button>}
      </form>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setType("")}
          className={`px-3 py-1 rounded-full text-sm ${!type ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          全部
        </button>
        {Object.entries(TASK_TYPES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`px-3 py-1 rounded-full text-sm ${type === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
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
                    <Badge variant="secondary" className="ml-2 shrink-0">{TASK_TYPES[t.type] || t.type}</Badge>
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
