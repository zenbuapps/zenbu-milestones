type TSpinnerSize = 'sm' | 'md' | 'lg';

type TLoadingSpinnerProps = {
  /** 尺寸：sm=16, md=24, lg=40 */
  size: TSpinnerSize;
};

const SIZE_MAP: Record<TSpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

/**
 * 環形載入動畫
 * 使用 CSS border 與 animate-spin 實作
 */
const LoadingSpinner = ({ size }: TLoadingSpinnerProps) => (
  <div
    className={`${SIZE_MAP[size]} inline-block animate-spin rounded-full border-[--color-border] border-t-[--color-brand]`}
    role="status"
    aria-label="載入中"
  />
);

export default LoadingSpinner;
