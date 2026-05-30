"use client";

import { useState, useEffect } from "react";

/**
 * 防抖 hook
 * 输入停止 delay 毫秒后才更新值，减少 API 请求
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
