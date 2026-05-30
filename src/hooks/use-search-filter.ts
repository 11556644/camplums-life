"use client";

import { useState, useCallback } from "react";

interface UseSearchFilterOptions {
  defaultCategory?: string;
}

/**
 * 搜索 + 分类过滤 hook
 * 提取 products/tasks/textbooks 页面的重复逻辑
 */
export function useSearchFilter(options: UseSearchFilterOptions = {}) {
  const { defaultCategory = "" } = options;
  const [category, setCategory] = useState(defaultCategory);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchInput("");
  }, []);

  const buildParams = useCallback((extraParams?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (searchQuery) params.set("q", searchQuery);
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v);
      }
    }
    return params;
  }, [category, searchQuery]);

  return {
    category,
    setCategory,
    searchQuery,
    searchInput,
    setSearchInput,
    handleSearch,
    clearSearch,
    buildParams,
    hasSearch: !!searchQuery,
  };
}
