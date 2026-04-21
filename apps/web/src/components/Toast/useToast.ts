import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from './ToastProvider';

/**
 * 存取 Toast 系統的 hook。
 *
 * 必須在 `<ToastProvider>` 內呼叫；若外層沒掛 Provider 會丟出 error
 * （提早失敗勝過 silently no-op，避免吞掉使用者看不到的回饋）。
 *
 * @example
 * const { showToast } = useToast();
 * showToast({ type: 'success', message: '草稿已送出' });
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('[useToast] 必須在 <ToastProvider> 內使用');
  }
  return ctx;
}
