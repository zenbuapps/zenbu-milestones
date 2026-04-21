import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type TStatusDonutChartProps = {
  done: number;
  inProgress: number;
  overdue: number;
  noDue: number;
};

/**
 * Milestone 狀態分布甜甜圈圖
 * 4 種狀態顏色分別為：完成=綠、進行中=藍、逾期=橘、未排程=灰
 */
const StatusDonutChart = ({
  done,
  inProgress,
  overdue,
  noDue,
}: TStatusDonutChartProps) => {
  const data = [
    { name: '已完成', value: done, fill: '#22c55e' },
    { name: '進行中', value: inProgress, fill: '#3b82f6' },
    { name: '逾期', value: overdue, fill: '#f97316' },
    { name: '未排程', value: noDue, fill: '#9ca3af' },
  ];
  const total = done + inProgress + overdue + noDue;

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
        <div className="text-xs text-[--color-text-muted]">總 Milestones</div>
      </div>
    </div>
  );
};

export default StatusDonutChart;
