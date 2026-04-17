type TProgressBarColor = 'brand' | 'success' | 'warning' | 'error';

type TProgressBarProps = {
  /** 進度值（0–1） */
  value: number;
  /** 填色色系，預設為 brand */
  color?: TProgressBarColor;
};

const COLOR_MAP: Record<TProgressBarColor, string> = {
  brand: 'bg-[--color-brand]',
  success: 'bg-[--color-success]',
  warning: 'bg-[--color-warning]',
  error: 'bg-[--color-error]',
};

/**
 * 進度條元件
 * 高度 6px，填色使用 CSS vars，支援 4 種語義色
 */
const ProgressBar = ({ value, color = 'brand' }: TProgressBarProps) => {
  const clamped = Math.max(0, Math.min(1, value));
  const percent = `${(clamped * 100).toFixed(1)}%`;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[--color-surface-overlay]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${COLOR_MAP[color]}`}
        style={{ width: percent }}
      />
    </div>
  );
};

export default ProgressBar;
