import { BarChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

// Tree-shaken registration：只註冊本專案兩張圖（長條 + 甜甜圈）會用到的模組，
// 避免把整包 echarts 打進 bundle。
echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type TEChartInstance = ReturnType<typeof echarts.init>;

/** ECharts 事件 handler；params 形狀依事件而定，由呼叫端自行縮型 */
export type TEChartEventHandler = (params: unknown) => void;

type TEChartProps = {
  option: EChartsOption;
  /** 圖表高度（px）；寬度永遠填滿容器 */
  height?: number;
  className?: string;
  /** ECharts 事件名 → handler，例如 { mouseover: fn, globalout: fn } */
  onEvents?: Record<string, TEChartEventHandler>;
};

/**
 * 通用 ECharts 容器。
 *
 * - instance 只建立 / 銷毀一次（mount / unmount）
 * - `option` 變動時以 notMerge 重設，確保資料更新乾淨
 * - 透過 ResizeObserver 自動 resize（RWD / sidebar 開合 / 視窗縮放）
 * - 事件 handler 以 ref 轉發，永遠呼叫到最新的 closure，但只註冊一次
 */
const EChart = ({ option, height = 320, className, onEvents }: TEChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<TEChartInstance | null>(null);
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;

    // 註冊 mount 當下宣告的事件名；handler 透過 ref 取最新版本
    Object.keys(onEventsRef.current ?? {}).forEach((name) => {
      chart.on(name, (params: unknown) => onEventsRef.current?.[name]?.(params));
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height }} />
  );
};

/** 讀取 :root 上的設計 token CSS 變數（ECharts canvas 無法直接吃 CSS var）*/
export const readCssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
};

export default EChart;
