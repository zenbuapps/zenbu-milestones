/**
 * Modal vs Drawer 決策記錄：採用 **Modal**（置中對話框）。
 *
 * 決策依據：
 * 1. `zenbuapps-design-system` skill 的 `references/modals.md` 明確定義 Modal 寬度規範：
 *    標準表單用 `max-w-md`、大型內容用 `max-w-2xl`。Issue 提交表單（標題 + Markdown 編輯器）
 *    屬於「需要較大編輯空間」的大型內容，適用 `max-w-2xl`。
 * 2. 該 skill 未針對 Markdown 編輯器提供 Drawer 範式；Drawer 主要用於側邊導覽 / 詳情快速預覽。
 * 3. 統一用 Modal 避免 mobile/desktop 兩套佈局導致 focus trap、鍵盤彈出、ESC 行為不一致。
 *    Mobile 情境以 `max-h-[85vh] overflow-y-auto` + 內部 scroll 來妥協鍵盤遮擋問題。
 * 4. plan.md §M2 雖提及「桌機 Modal、手機 Drawer」，但本專案目前無 Drawer 基礎建設；
 *    先交付單一 Modal 路徑，若未來有強烈 mobile 反饋再升級。
 *
 * 無障礙（ARIA）：
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`（指向 h2）
 * - 首個 focusable（標題 input）自動 focus
 * - 焦點鎖定在 panel 內（Tab / Shift+Tab 循環）
 * - ESC 關閉
 * - 背景點擊關閉（若表單有未送出的內容則 confirm）
 * - body scroll lock 避免底層滾動
 */

import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
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
 * Issue 提交對話框外殼。
 *
 * 負責：
 * - 背景 overlay + 置中 panel 佈局
 * - ESC / 背景點擊關閉（未送出時 confirm）
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

  /** 嘗試關閉 —— 有未送出內容時先 confirm */
  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const ok = window.confirm('表單尚未送出，確定關閉？');
      if (!ok) return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  // body scroll lock
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // ESC 關閉 + 初始 focus + 還原 focus
  useEffect(() => {
    if (!open) return;

    // 記住開啟前的 focus，關閉時還原
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', handler);

    // 首個 focusable 自動 focus（下一個 tick，等 DOM 穩定）
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 0);

    return () => {
      window.removeEventListener('keydown', handler);
      window.clearTimeout(focusTimer);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, requestClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={requestClose}
      aria-hidden="false"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[--color-border] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-[--color-text-primary]"
            >
              提出 Issue
            </h2>
            <p className="mt-0.5 truncate text-xs text-[--color-text-muted]">
              送出後會進入審核佇列，核准後才會轉送到 GitHub · {repoName}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="關閉對話框"
            className="btn-ghost -mr-2 p-1.5"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};

export default IssueSubmitDialog;
