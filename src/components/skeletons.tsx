/**
 * 页面级骨架屏组件
 * 替换各页面的 "加载中..." 文本
 */

/** 列表页骨架屏（商品、任务、订单） */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
              <div className="h-3 w-1/4 bg-gray-100 rounded" />
            </div>
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 详情页骨架屏 */
export function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-1/3 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-100 rounded" />
      <div className="h-4 w-2/3 bg-gray-100 rounded" />
      <div className="h-32 w-full bg-gray-100 rounded-lg" />
      <div className="flex gap-2">
        <div className="h-10 w-24 bg-gray-200 rounded" />
        <div className="h-10 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

/** 卡片网格骨架屏（首页、管理看板） */
export function CardGridSkeleton({ count = 4, columns = 4 }: { count?: number; columns?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 animate-pulse space-y-3">
          <div className="h-8 w-8 bg-gray-200 rounded mx-auto" />
          <div className="h-5 w-20 bg-gray-200 rounded mx-auto" />
          <div className="h-3 w-28 bg-gray-100 rounded mx-auto" />
        </div>
      ))}
    </div>
  );
}

/** 内联加载指示器 */
export function InlineLoader({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-2">
      <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-gray-400 text-sm">{text}</span>
    </div>
  );
}
