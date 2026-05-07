import { useMemo, useState } from 'react';
import type { Roadmap } from 'shared';
import { deriveRoadmapStatus } from '../utils/progress';
import RoadmapNode from './RoadmapNode';

type TRoadmapTimelineProps = {
  roadmaps: Roadmap[];
};

/**
 * 排序：有 dueOn 的依 dueOn 升序；沒有 dueOn 的放最後，依 createdAt 降序
 */
const sortRoadmaps = (list: Roadmap[]): Roadmap[] =>
  list.slice().sort((a, b) => {
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    if (a.dueOn && !b.dueOn) return -1;
    if (!a.dueOn && b.dueOn) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

/**
 * 推導預設展開的 roadmap number
 * 優先序：最近一個 in_progress > 第一個 overdue > 第一個
 */
const pickDefaultExpanded = (sorted: Roadmap[]): number | null => {
  if (sorted.length === 0) return null;

  const inProgress = sorted.find((m) => deriveRoadmapStatus(m) === 'in_progress');
  if (inProgress) return inProgress.number;

  const overdue = sorted.find((m) => deriveRoadmapStatus(m) === 'overdue');
  if (overdue) return overdue.number;

  return sorted[0].number;
};

/**
 * Roadmap 垂直時間軸
 * 左側貫穿一條垂直線，節點按 dueOn 升序排列，預設展開下一個進行中的 roadmap
 */
const RoadmapTimeline = ({ roadmaps }: TRoadmapTimelineProps) => {
  const sorted = useMemo(() => sortRoadmaps(roadmaps), [roadmaps]);

  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => {
    const initial = pickDefaultExpanded(sorted);
    return new Set(initial !== null ? [initial] : []);
  });

  const toggle = (number: number): void => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  if (sorted.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* 垂直線 */}
      <div className="absolute bottom-0 left-4 top-0 w-px bg-[--color-border]" aria-hidden="true" />
      <div className="flex flex-col">
        {sorted.map((m) => (
          <RoadmapNode
            key={m.number}
            roadmap={m}
            expanded={expandedSet.has(m.number)}
            onToggle={() => toggle(m.number)}
          />
        ))}
      </div>
    </div>
  );
};

export default RoadmapTimeline;
