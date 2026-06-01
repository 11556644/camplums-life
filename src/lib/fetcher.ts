export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}
