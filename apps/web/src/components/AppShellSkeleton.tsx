/**
 * AppShellSkeleton（issue #31）
 *
 * 取代原本「summary 還沒回來時整片置中 LoadingSpinner」的單調畫面。
 * 維持 sidebar + main 兩欄佈局，內部以淡灰色 placeholder 模擬真實資料的形狀，
 * 讓使用者第一時間就看到結構與層次，而不是只看到一顆轉圈圈。
 *
 * 不引入 shimmer 等動畫，只用 tailwind 的 animate-pulse + bg-[--color-surface-overlay]
 * 維持 design system 既有色票與行為。
 */

const Bar = ({ className = '' }: { className?: string }) => (
  <div
    className={`animate-pulse rounded bg-[--color-surface-overlay] ${className}`}
  />
);

/** 側欄 skeleton：搜尋框 + 5 行 repo placeholder（與真實 Sidebar 寬度一致） */
export const SidebarSkeleton = () => (
  <aside className="hidden md:flex w-[220px] flex-shrink-0 flex-col gap-3 border-r border-[--color-border] bg-white p-4">
    <Bar className="h-8 w-full" />
    <Bar className="mt-2 h-3 w-16" />
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-2 py-1">
        <Bar className="h-3 flex-1" />
        <Bar className="h-4 w-6" />
      </div>
    ))}
  </aside>
);

/** 4 張 StatCard placeholder */
const StatCardSkeleton = () => (
  <div className="card flex items-center gap-3 p-4 sm:p-5">
    <div className="h-10 w-10 animate-pulse rounded-lg bg-[--color-surface-overlay]" />
    <div className="flex-1">
      <Bar className="h-3 w-20" />
      <Bar className="mt-2 h-6 w-16" />
      <Bar className="mt-2 h-3 w-24" />
    </div>
  </div>
);

/** 圖表 placeholder（同高度，內含一條較深的『假資料』bar 模擬圖表）*/
const ChartSkeleton = () => (
  <div className="card flex flex-col gap-3 p-5">
    <Bar className="h-4 w-32" />
    <Bar className="h-3 w-48" />
    <div className="mt-2 flex h-[280px] items-end gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t bg-[--color-surface-overlay]"
          style={{ height: `${30 + ((i * 37) % 60)}%` }}
        />
      ))}
    </div>
  </div>
);

/** Issue digest section placeholder */
const DigestSkeleton = () => (
  <div className="card flex flex-col gap-3 p-5">
    <Bar className="h-4 w-40" />
    <Bar className="h-3 w-48" />
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex flex-col gap-1 border-t border-[--color-border] pt-2">
        <Bar className="h-3 w-32" />
        <Bar className="h-4 w-full" />
      </div>
    ))}
  </div>
);

/** Repo list row placeholder */
const RepoRowSkeleton = () => (
  <div className="card flex items-center gap-4 p-4 sm:p-5">
    <div className="h-4 w-4 animate-pulse rounded bg-[--color-surface-overlay]" />
    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
      <Bar className="h-4 w-40" />
      <Bar className="h-3 w-72" />
    </div>
    <div className="hidden sm:flex w-48 flex-col gap-1.5">
      <Bar className="h-3 w-full" />
      <Bar className="h-2 w-full" />
    </div>
    <div className="hidden sm:flex w-24 justify-end">
      <Bar className="h-3 w-16" />
    </div>
  </div>
);

/**
 * 主畫面 skeleton：對齊 OverviewPage 的真實結構，把每塊內容換成 placeholder
 */
export const OverviewSkeleton = () => (
  <div className="flex flex-1 flex-col overflow-y-auto bg-[--color-surface]">
    <div className="flex-1 p-4 sm:p-6">
      {/* PageHeader */}
      <div className="mb-6 flex flex-col gap-2">
        <Bar className="h-7 w-32" />
        <Bar className="h-4 w-64" />
      </div>

      {/* 4 張 StatCard */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* 2 張圖表 */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* 2 個 issue digest */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <DigestSkeleton />
        <DigestSkeleton />
      </div>

      {/* Repo 列表 */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <RepoRowSkeleton key={i} />
        ))}
      </div>
    </div>
  </div>
);
