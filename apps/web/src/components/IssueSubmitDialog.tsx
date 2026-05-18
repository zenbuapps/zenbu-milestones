/**
 * Modal vs Drawer 決策記錄：採用 **Modal**（置中對話框）。
 *
 * 決策依據：
 * 1. `zenbuapps-design-system` skill 的 `references/modals.md` 雖訂出 `max-w-md/2xl` 等
 *    寬度規範，但 Issue 提交表單帶 Markdown 編輯器+即時預覽，本質上是「資料密集型工作區」，
 *    沿用通用 modal 寬度會壓縮編輯器到難用程度。本次依 issue #5 規格上修為 `max-w-[1200px]`。
 * 2. 該 skill 未針對 Markdown 編輯器提供 Drawer 範式；Drawer 主要用於側邊導覽 / 詳情快速預覽。
 * 3. 統一用 Modal 避免 mobile/desktop 兩套佈局導致 focus trap、鍵盤彈出、ESC 行為不一致。
 *    Mobile 情境以 `max-h-[85vh] overflow-y-auto` + 內部 scroll 來妥協鍵盤遮擋問題。
 * 4. 全螢幕模式（issue #5）：使用者點 header 右上角的 Maximize 圖示 → 整個 modal 變
 *    `fixed inset-0`（鋪滿視窗），ESC 先退出全螢幕，第二次 ESC 才關閉。
 *
 * 無障礙（ARIA）：
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`（指向 h2）
 * - 首個 focusable（標題 input）自動 focus
 * - 焦點鎖定在 panel 內（Tab / Shift+Tab 循環）
 * - ESC 關閉
 * - 背景點擊關閉（若表單有未送出的內容則 confirm）
 * - body scroll lock 避免底層滾動
 */

import { Maximize2, Minimize2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

type TIssueSubmitDialogProps = {
  /** Dialog 是否開啟 */
  open: boolean;
  /** 關閉請求（ESC / 背景點擊 / 關閉按鈕） */
  onClose: () => void;
  /** 用於判斷是否需要 confirm 才能關閉（表單有內容且未送出） */
  hasUnsavedChanges: boolean;
  /** 傳入當前 repo 名稱，顯示在標題，方便使用者確認投稿對象 */
  repoName: string;
  /** Dialog 內容（通常是 IssueSubmitForm） */
  children: ReactNode;
};

/** 可取得焦點的元素選擇器（用於 focus trap 與初始聚焦） */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 讓 Dialog 內的後代元件（IssueSubmitForm）可以讀到目前是否處於全螢幕。
 * 用於 MDEditor 等需要根據視窗高度調整尺寸的場景。
 */
const DialogFullscreenContext = createContext<boolean>(false);
export const useIsDialogFullscreen = (): boolean => useContext(DialogFullscreenContext);

/**
 * Issue 提交對話框外殼。
 *
 * 負責：
 * - 背景 overlay + 置中 panel 佈局；切換全螢幕（fixed inset-0）
 * - ESC（在全螢幕時改成只退出全螢幕） / 背景點擊關閉（未送出時 confirm）
 * - focus trap（Tab 循環、初始 focus 第一個 input）
 * - body scroll lock
 *
 * 不負責：表單內容（由 children 渲染）
 */
const IssueSubmitDialog = ({
  open,
  onClose,
  hasUnsavedChanges,
  repoName,
  children,
}: TIssueSubmitDialogProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [isFullscreen, setIsFullscreen] = useState(false);

  /** 嘗試關閉 —— 有未送出內容時先 confirm */
  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const ok = window.confirm('表單尚未送出，確定關閉？');
      if (!ok) return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  /** 每次開關 dialog 時，把全螢幕狀態 reset，避免下次開啟還停在 fullscreen */
  useEffect(() => {
    if (!open) setIsFullscreen(false);
  }, [open]);

  // body scroll lock
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // issue #28：把「初始 focus / 還原 focus」與「ESC 關閉」拆成兩個 effect
  // 原本合在一起時 deps 含 requestClose / isFullscreen，且 requestClose
  // 因為 useCallback 依賴 hasUnsavedChanges，使用者每打一個字就讓
  // requestClose 換 identity → effect 重跑 → setTimeout 把 focus 拉回
  // panel 內第一個 focusable（DOM 順序上是右上角的 Maximize2 全螢幕按鈕），
  // 使用者連續輸入或 backspace 清空就會觸發。

  // (a) 初始 focus + 記住先前 focus 元素 + 卸載時還原，deps 只看 open
  useEffect(() => {
    if (!open) return;

    // 記住開啟前的 focus，關閉時還原
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // 首個 focusable 自動 focus（下一個 tick，等 DOM 穩定）
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  // (b) ESC 鍵：全螢幕時先退全螢幕、否則 requestClose；deps 跟著
  //     isFullscreen / requestClose 走，但不會觸發 re-focus
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        requestClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, requestClose, isFullscreen]);

  /** Focus trap：在 panel 內循環 Tab / Shift+Tab */
  const handlePanelKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  // 外層 backdrop：全螢幕時不要 padding（避免在 panel 周圍露出黑邊）
  const backdropClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-black/50'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';

  // panel 樣式：全螢幕鋪滿；非全螢幕置中、max-w-[1200px]、max-h-[85vh]
  const panelClass = isFullscreen
    ? 'fixed inset-0 flex h-full w-full flex-col overflow-hidden bg-white'
    : 'flex max-h-[85vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl';

  return (
    <div className={backdropClass} onClick={requestClose} aria-hidden="false">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
        className={panelClass}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[--color-border] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[--color-text-primary]">
              提出 Issue
            </h2>
            <p className="mt-0.5 truncate text-xs text-[--color-text-muted]">
              送出後會進入審核佇列，核准後才會轉送到 GitHub · {repoName}
            </p>
          </div>
          <div className="-mr-2 flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={isFullscreen ? '結束全螢幕' : '開啟全螢幕'}
              aria-pressed={isFullscreen}
              title={isFullscreen ? '結束全螢幕（ESC）' : '全螢幕'}
              className="btn-ghost p-1.5"
            >
              {isFullscreen ? (
                <Minimize2 size={16} strokeWidth={2} />
              ) : (
                <Maximize2 size={16} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={requestClose}
              aria-label="關閉對話框"
              className="btn-ghost p-1.5"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <DialogFullscreenContext.Provider value={isFullscreen}>
            {children}
          </DialogFullscreenContext.Provider>
        </div>
      </div>
    </div>
  );
};

export default IssueSubmitDialog;
