"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardTab } from "./tabs/dashboard-tab";
import { OrdersTab } from "./tabs/orders-tab";
import { ProductsTab } from "./tabs/products-tab";
import { DisputesTab } from "./tabs/disputes-tab";
import { UsersTab } from "./tabs/users-tab";
import { CabinetsTab } from "./tabs/cabinets-tab";
import { TextbooksTab } from "./tabs/textbooks-tab";

const tabs = [
  { key: "dashboard", label: "数据看板", Component: DashboardTab },
  { key: "orders", label: "订单管理", Component: OrdersTab },
  { key: "products", label: "商品管理", Component: ProductsTab },
  { key: "disputes", label: "投诉处理", Component: DisputesTab },
  { key: "users", label: "用户管理", Component: UsersTab },
  { key: "cabinets", label: "柜机管理", Component: CabinetsTab },
  { key: "textbooks", label: "书籍管理", Component: TextbooksTab },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const loadingAuth = useAuthStore((s) => s.loading);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dashboard");

  useEffect(() => {
    if (loadingAuth) return;
    if (!user || !user.roles.includes("admin")) router.push("/");
  }, [user, router, loadingAuth]);

  if (loadingAuth) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">验证权限中...</div>;
  if (!user || !user.roles.includes("admin")) return null;

  const ActiveTab = tabs.find(t => t.key === tab)?.Component ?? DashboardTab;

  return (
    <div className="container mx-auto px-4 py-5">
      <h1 className="text-xl font-bold mb-3">运营后台</h1>
      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <ActiveTab />
    </div>
  );
}
