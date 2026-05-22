import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import type { RepoSummary } from 'shared';
import EChart, { readCssVar } from './EChart';

type TCompletionBarChartProps = {
  /** 只傳入有 roadmap 的 repo */
  repos: RepoSummary[];
};

const COLOR_OPEN = '#2563eb';
const COLOR_CLOSED = '#22c55e';
const CHART_HEIGHT = 320;

/**
 * 各 repo 的 Issue 開關比例堆疊長條圖（ECharts 版，issue #33）
 * open = 藍色、closed = 綠色；提供 axis tooltip、legend 切換、hover 高亮等互動。
 */
const CompletionBarChart = ({ repos }: TCompletionBarChartProps) => {
  const sorted = useMemo(
    () =>
      repos
        .slice()
        .sort(
          (a, b) =>
            b.openIssues + b.closedIssues - (a.openIssues + a.closedIssues),
        ),
    [repos],
  );

  const option = useMemo<EChartsOption>(() => {
    const border = readCssVar('--color-border', '#e5e7eb');
    const muted = readCssVar('--color-text-muted', '#6b7280');

    return {
      // 與 .card 一致的字體
      textStyle: { fontFamily: 'inherit' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        borderColor: border,
        borderWidth: 1,
        backgroundColor: '#ffffff',
        textStyle: { color: '#111827', fontSize: 12 },
        extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);',
      },
      legend: {
        bottom: 0,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { fontSize: 12, color: muted },
        data: ['Open', 'Closed'],
      },
      grid: { top: 12, right: 12, left: 4, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: sorted.map((r) => r.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: border } },
        axisLabel: {
          fontSize: 12,
          color: muted,
          interval: 0,
          rotate: 28,
          // 名稱過長時截斷，避免互相重疊（hover tooltip 仍顯示完整 repo）
          formatter: (value: string) =>
            value.length > 14 ? `${value.slice(0, 13)}…` : value,
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { fontSize: 12, color: muted },
        splitLine: { lineStyle: { color: border, type: 'dashed' } },
      },
      series: [
        {
          name: 'Open',
          type: 'bar',
          stack: 'issues',
          data: sorted.map((r) => r.openIssues),
          itemStyle: { color: COLOR_OPEN },
          emphasis: { focus: 'series' },
          barMaxWidth: 48,
        },
        {
          name: 'Closed',
          type: 'bar',
          stack: 'issues',
          data: sorted.map((r) => r.closedIssues),
          // 只有堆疊最上層（closed）做圓角，視覺與舊版一致
          itemStyle: { color: COLOR_CLOSED, borderRadius: [4, 4, 0, 0] },
          emphasis: { focus: 'series' },
          barMaxWidth: 48,
        },
      ],
    };
  }, [sorted]);

  // 手機版若 repo 數量較多，X 軸會被擠成一團 —— 外層 overflow-x-auto，讓使用者橫向捲動檢視
  // min-w 依資料量動態估算（每根柱子至少 56px，再加上邊距），但不低於 520px
  const minWidthPx = Math.max(520, sorted.length * 56 + 80);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: minWidthPx }}>
        <EChart option={option} height={CHART_HEIGHT} />
      </div>
    </div>
  );
};

export default CompletionBarChart;
