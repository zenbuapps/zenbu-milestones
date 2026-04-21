import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/** 支援的 toast 類型，對應色彩與 ARIA role */
export type ToastType = 'success' | 'error' | 'info';

/** showToast 的輸入形狀 */
export interface ShowToastInput {
  type: ToastType;
  message: string;
  /** 行動連結文字（例如「查看我的 issue」） */
  linkText?: string;
  /** 行動連結 URL（支援 hash path 如 `/#/me/issues`） */
  linkUrl?: string;
  /** 自訂停留時間（ms），預設 5000；傳 0 表示不自動消失 */
  durationMs?: number;
}

/** Provider 內部的 toast entry（額外帶 id） */
interface ToastEntry extends ShowToastInput {
  id: string;
}

type ToastAction =
  | { type: 'add'; toast: ToastEntry }
  | { type: 'remove'; id: string }
  | { type: 'clear' };

interface ToastState {
  toasts: ToastEntry[];
}

const DEFAULT_DURATION_MS = 5000;

const reducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'add':
      return { toasts: [...state.toasts, action.toast] };
    case 'remove':
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'clear':
      return { toasts: [] };
    default:
      return state;
  }
};

/** Context shape — 只暴露 action，不暴露 state（避免呼叫端直接操作陣列） */
export interface ToastContextValue {
  showToast: (input: ShowToastInput) => string;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

type TToastProviderProps = {
  children: ReactNode;
};

/**
 * Toast 系統的頂層 Provider。
 *
 * 設計：
 * - 透過 `useReducer` 管理 toast 陣列（add / remove / clear）
 * - 每筆 toast 依 `durationMs`（預設 5s）自動消失，可手動關閉
 * - 使用 `createPortal` 掛到 `document.body`，避免被頁面 overflow 吃掉
 * - `success` 用 `role="status"`（polite）、`error` 用 `role="alert"`（assertive）
 */
const ToastProvider = ({ children }: TToastProviderProps) => {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });
  // 保留每個 toast 對應的 timer，手動 dismiss 時要清掉
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    dispatch({ type: 'remove', id });
  }, []);

  const showToast = useCallback(
    (input: ShowToastInput): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: ToastEntry = { id, ...input };
      dispatch({ type: 'add', toast: entry });

      const duration = input.durationMs ?? DEFAULT_DURATION_MS;
      if (duration > 0) {
        const timer = window.setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  // 卸載時清所有 timer，避免 memory leak
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <ToastViewport toasts={state.toasts} onDismiss={dismissToast} />,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

type TToastViewportProps = {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
};

/**
 * 實際渲染 toast 列表的容器。
 * 置於頁面頂端居中（mobile-friendly；避開 iOS 底部手勢區），使用 fixed + z-[60]。
 */
const ToastViewport = ({ toasts, onDismiss }: TToastViewportProps) => (
  <div
    className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:top-6"
    aria-live="polite"
    aria-atomic="false"
  >
    {toasts.map((toast) => (
      <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
    ))}
  </div>
);

type TToastItemProps = {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
};

const TOAST_STYLES: Record<ToastType, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-[--color-success]' },
  error: { icon: AlertCircle, color: 'text-[--color-error]' },
  info: { icon: Info, color: 'text-[--color-brand]' },
};

/**
 * 單一 toast 卡片。
 * - error 使用 role="alert"（螢幕閱讀器立即宣告）
 * - 其他用 role="status"
 */
const ToastItem = ({ toast, onDismiss }: TToastItemProps) => {
  const { icon: Icon, color } = TOAST_STYLES[toast.type];
  const role = toast.type === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className="card pointer-events-auto flex w-full max-w-md items-start gap-3 px-4 py-3 shadow-lg"
    >
      <Icon size={18} strokeWidth={2.25} className={`mt-0.5 flex-shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[--color-text-primary]">{toast.message}</p>
        {toast.linkText && toast.linkUrl && (
          <a
            href={toast.linkUrl}
            className="mt-1 inline-block text-xs font-medium text-[--color-brand] hover:underline"
          >
            {toast.linkText}
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="關閉通知"
        className="btn-ghost -mr-2 -mt-1 p-1"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
};

export default ToastProvider;
