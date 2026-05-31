"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import { InlineLoader } from "@/components/skeletons";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";
import { useDebounce } from "@/hooks/use-debounce";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  location: string | null;
  seller: { id: string; nickname: string; dormitory: string | null };
  createdAt: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    if (data.success) setProducts(data.data.products);
    if (!silent) setLoading(false);
  }, [category, debouncedSearch]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // SSE：商品变更时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "product") fetchProducts(true);
  }, [fetchProducts]);
  useRealtime(handleRealtime, [fetchProducts]);

  return (
    <div className="container mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">闲置市场</h1>
        <Link href="/products/publish" className="text-sm text-blue-600 hover:underline">发布商品</Link>
      </div>

      {/* 搜索 + 筛选合并 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索商品..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-48 sm:w-64 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {searchInput && <button type="button" onClick={() => setSearchInput("")} className="text-sm text-gray-500 hover:text-gray-700">清除</button>}
        <div className="h-5 w-px bg-gray-200 hidden sm:block" />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategory("")}
            className={`px-3 py-1.5 rounded-full text-sm ${!category ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            全部
          </button>
          {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-3 py-1.5 rounded-full text-sm ${category === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <InlineLoader />
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无商品</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-start justify-between gap-1">
                    <CardTitle className="text-base line-clamp-1">{p.title}</CardTitle>
                    <Badge variant="secondary" className="shrink-0 text-xs px-1.5 py-0">{CATEGORY_LABELS[p.category]?.label || p.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-1">
                  <p className="text-sm text-gray-500 line-clamp-2 mb-2">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-red-600">¥{p.price}</span>
                    <span className="text-xs text-gray-400">{p.seller.dormitory || "未知"}</span>
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
