import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type TStatusDonutChartProps = {
  done: number;
  inProgress: number;
  overdue: number;
  /**
   * 「未建立 Roadmap」的 repo 數量（issue #27）
   *
   * 注意：這個切片的 unit 與 done/inProgress/overdue 不同 —
   *   - done/inProgress/overdue 是 roadmap 數
   *   - noRoadmap 是 repo 數
   * 圖示 / tooltip / center label 已配合說明，避免使用者誤把切片加總當成單一單位
   */
  noRoadmap: number;
};

/**
 * Roadmap 狀態分布甜甜圈圖（issue #27 修正：加入「未建立 Roadmap 的 repo」切片）
 * 切片顏色：完成=綠、進行中=藍、逾期=橘、未建立 Roadmap=淡灰
 */
const StatusDonutChart = ({
  done,
  inProgress,
  overdue,
  noRoadmap,
}: TStatusDonutChartProps) => {
  const data = [
    { name: '已完成', value: done, fill: '#22c55e' },
    { name: '進行中', value: inProgress, fill: '#3b82f6' },
    { name: '逾期', value: overdue, fill: '#f97316' },
    { name: '未建立 Roadmap', value: noRoadmap, fill: '#d1d5db' },
  ];
  const total = done + inProgress + overdue + noRoadmap;

  return (
    <div className="relative h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 12,
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
        <div className="text-2xl font-semibold text-[--color-text-primary]">{total}</div>
        <div className="text-xs text-[--color-text-muted]">
          資料點（Roadmap + 未建 Repo）
        </div>
      </div>
    </div>
  );
};

export default StatusDonutChart;
