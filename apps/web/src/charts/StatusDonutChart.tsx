import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import EChart, { readCssVar } from './EChart';

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

const CHART_HEIGHT = 320;
const DEFAULT_CENTER_LABEL = '資料點（Roadmap + 未建 Repo）';

/** ECharts pie hover/select 事件的 params 子集 */
type TPieEventParams = {
  seriesType?: string;
  name?: string;
  value?: number;
};

/**
 * Roadmap 狀態分布甜甜圈圖（ECharts 版，issue #33）
 *
 * 切片顏色：完成=綠、進行中=藍、逾期=橘、未建立 Roadmap=淡灰
 * 互動性：
 *   - hover 切片放大 + 中央文字即時切換成該切片的名稱與數值
 *   - tooltip 顯示數值與百分比
 *   - legend 可點擊切換顯示 / 隱藏切片
 */
const StatusDonutChart = ({
  done,
  inProgress,
  overdue,
  noRoadmap,
}: TStatusDonutChartProps) => {
  const total = done + inProgress + overdue + noRoadmap;

  // 中央文字：預設顯示總數；hover 時切換成該切片
  const [center, setCenter] = useState<{ value: number; label: string }>({
    value: total,
    label: DEFAULT_CENTER_LABEL,
  });

  const option = useMemo<EChartsOption>(() => {
    const border = readCssVar('--color-border', '#e5e7eb');
    const muted = readCssVar('--color-text-muted', '#6b7280');

    return {
      textStyle: { fontFamily: 'inherit' },
      tooltip: {
        trigger: 'item',
        formatter: '{b}：{c}（{d}%）',
        borderColor: border,
        borderWidth: 1,
        backgroundColor: '#ffffff',
        textStyle: { color: '#111827', fontSize: 12 },
        extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);',
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 12, color: muted },
        data: ['已完成', '進行中', '逾期', '未建立 Roadmap'],
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '80%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          padAngle: 1.5,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.18)' },
          },
          data: [
            { name: '已完成', value: done, itemStyle: { color: '#22c55e' } },
            { name: '進行中', value: inProgress, itemStyle: { color: '#3b82f6' } },
            { name: '逾期', value: overdue, itemStyle: { color: '#f97316' } },
            {
              name: '未建立 Roadmap',
              value: noRoadmap,
              itemStyle: { color: '#d1d5db' },
            },
          ],
        },
      ],
    };
  }, [done, inProgress, overdue, noRoadmap]);

  const onEvents = useMemo(
    () => ({
      mouseover: (params: unknown) => {
        const p = params as TPieEventParams;
        if (p.seriesType !== 'pie' || typeof p.value !== 'number') return;
        setCenter({ value: p.value, label: p.name ?? DEFAULT_CENTER_LABEL });
      },
      globalout: () => setCenter({ value: total, label: DEFAULT_CENTER_LABEL }),
    }),
    [total],
  );

  return (
    <div className="relative" style={{ height: CHART_HEIGHT }}>
      <EChart option={option} height={CHART_HEIGHT} onEvents={onEvents} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
        <div className="text-2xl font-semibold text-[--color-text-primary]">
          {center.value}
        </div>
        <div className="max-w-[150px] text-center text-xs text-[--color-text-muted]">
          {center.label}
        </div>
      </div>
    </div>
  );
};

export default StatusDonutChart;
