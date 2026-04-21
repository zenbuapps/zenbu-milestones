import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RepoSummary } from 'shared';

type TCompletionBarChartProps = {
  /** 只傳入有 milestone 的 repo */
  repos: RepoSummary[];
};

type TRow = {
  name: string;
  open: number;
  closed: number;
};

/**
 * 各 repo 的 Issue 開關比例堆疊長條圖
 * open = 藍色、closed = 綠色
 */
const CompletionBarChart = ({ repos }: TCompletionBarChartProps) => {
  const data: TRow[] = repos
    .slice()
    .sort((a, b) => b.openIssues + b.closedIssues - (a.openIssues + a.closedIssues))
    .map((r) => ({
      name: r.name,
      open: r.openIssues,
      closed: r.closedIssues,
    }));

  // 手機版若 repo 數量較多，X 軸會被擠成一團 —— 外層 overflow-x-auto，讓使用者橫向捲動檢視
  // min-w 依資料量動態估算（每根柱子至少 40px，再加上 Y 軸與邊距），但不低於 520px
  const minWidthPx = Math.max(520, data.length * 48 + 80);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: minWidthPx }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Bar dataKey="open" name="Open" stackId="issues" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="closed" name="Closed" stackId="issues" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CompletionBarChart;
