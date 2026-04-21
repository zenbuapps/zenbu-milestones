import type { Milestone, MilestoneDerivedStatus } from '../data/types';
import { isOverdue } from './date';

/**
 * 由 open / closed 數量計算完成率（0–1）
 * 若總數為 0 回傳 0（避免除以零）
 */
export const computeCompletion = (open: number, closed: number): number => {
  const total = open + closed;
  if (total === 0) return 0;
  return closed / total;
};

/**
 * 依 milestone 的 state 與 dueOn 推導 UI 顯示用狀態
 * - done：state = closed
 * - overdue：state = open && dueOn 已過
 * - in_progress：state = open && dueOn 尚未過
 * - no_due：state = open && 沒有 dueOn
 */
export const deriveMilestoneStatus = (m: Milestone): MilestoneDerivedStatus => {
  if (m.state === 'closed') return 'done';
  if (!m.dueOn) return 'no_due';
  if (isOverdue(m.dueOn)) return 'overdue';
  return 'in_progress';
};
