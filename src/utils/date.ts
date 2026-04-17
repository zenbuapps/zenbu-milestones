/**
 * 日期工具集
 * 所有函式接受 ISO 8601 字串（可含或不含毫秒 / 時區）
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_MINUTE = 1000 * 60;

/**
 * 將 ISO 字串轉為 YYYY-MM-DD 格式（以當地時區輸出）
 */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 距離指定日期還有幾天。正數 = 未到，負數 = 已逾期
 */
export const daysUntil = (iso: string): number => {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  const now = Date.now();
  return Math.round((target - now) / MS_PER_DAY);
};

/**
 * 人類語意的相對時間字串（用於 UI 顯示）
 * - 未來：「3 天後」「3 小時後」
 * - 過去：「逾期 2 天」「3 小時前」
 */
export const formatRelative = (iso: string): string => {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const diff = target - Date.now();
  const absDiff = Math.abs(diff);

  if (absDiff < MS_PER_MINUTE) {
    return diff >= 0 ? '即將到期' : '剛才';
  }
  if (absDiff < MS_PER_HOUR) {
    const mins = Math.round(absDiff / MS_PER_MINUTE);
    return diff >= 0 ? `${mins} 分鐘後` : `${mins} 分鐘前`;
  }
  if (absDiff < MS_PER_DAY) {
    const hours = Math.round(absDiff / MS_PER_HOUR);
    return diff >= 0 ? `${hours} 小時後` : `${hours} 小時前`;
  }

  const days = Math.round(absDiff / MS_PER_DAY);
  if (diff >= 0) {
    if (days === 1) return '明天';
    return `${days} 天後`;
  }
  if (days === 1) return '昨天';
  return `逾期 ${days} 天`;
};

/**
 * 判斷 milestone 是否已逾期（dueOn 為 null 視為沒有到期日，不逾期）
 */
export const isOverdue = (dueOn: string | null): boolean => {
  if (!dueOn) return false;
  const target = new Date(dueOn).getTime();
  if (Number.isNaN(target)) return false;
  return target < Date.now();
};
