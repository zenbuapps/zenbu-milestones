/**
 * RejectReasonDialog
 * ---------------------------------------------------------------
 * 管理員拒絕 issue 的理由輸入對話框。
 *
 * 設計依據（zenbuapps-design-system/references/modals.md）：
 * - 採用 **Modal**（置中）而非 Drawer，理由與 IssueSubmitDialog 相同：
 *   拒絕理由是需要填表 + 確認的短流程，Modal 在桌機 / 手機皆可用；
 *   Drawer 主要用於「側邊導覽 / 詳情快速預覽」，與本流程不符。
 * - 寬度沿用標準表單 `max-w-md`（單一 textarea，不需要 max-w-2xl 的大編輯器）
 * - 無障礙：`role="dialog"` + `aria-modal="true"` + `aria-labelledby` + ESC 關閉 + focus 轉移
 *
 * 為了維持 bundle 精簡，本元件比 IssueSubmitDialog 薄：
 * - 不做 focus trap（單一 textarea + 兩顆按鈕，逃出範圍風險極低）
 * - 不做「未儲存確認」（admin 拒絕理由是副作用可逆的，關掉就算了）
 */

import { AlertCircle, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

const REASON_MAX = 1000;
const REASON_MIN = 1;

type TRejectReasonDialogProps = {
  /** Dialog 是否開啟 */
  open: boolean;
  /** 要拒絕的 issue 標題，顯示在 description 幫助管理員確認物件 */
  issueTitle: string;
  /** 關閉（ESC / 取消 / 背景點擊 / X） */
  onClose: () => void;
  /** 送出拒絕理由 —— 成功 resolve，失敗 throw（errorMessage 顯示於 dialog 內） */
  onSubmit: (reason: string) => Promise<void>;
};

/**
 * 管理員拒絕 issue 的理由輸入對話框。
 */
const RejectReasonDialog = ({ open, issueTitle, onClose, onSubmit }: TRejectReasonDialogProps) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // 開啟時：清空 state、記錄舊 focus、自動 focus textarea
  useEffect(() => {
    if (!open) return;
    setReason('');
    setErrorMessage(null);
    setSubmitting(false);
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  // body scroll lock + ESC 關閉
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!submitting) onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handler);
    };
  }, [open, submitting, onClose]);

  const reasonLen = reason.length;
  const reasonTrim = reason.trim();
  const canSubmit =
    !submitting && reasonTrim.length >= REASON_MIN && reasonTrim.length <= REASON_MAX;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(reasonTrim);
      // 成功後 onSubmit 所在的呼叫端會關閉 dialog
    } catch (err) {
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : '拒絕失敗，請稍後重試';
      setErrorMessage(msg);
    }
  }, [canSubmit, onSubmit, reasonTrim]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      aria-hidden="false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[--color-border] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[--color-text-primary]">
              拒絕 Issue
            </h2>
            <p className="mt-0.5 truncate text-xs text-[--color-text-muted]" title={issueTitle}>
              {issueTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉對話框"
            disabled={submitting}
            className="btn-ghost -mr-2 p-1.5"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <label htmlFor={`${titleId}-reason`} className="label">
            拒絕理由 <span className="text-[--color-error]">*</span>
          </label>
          <textarea
            ref={textareaRef}
            id={`${titleId}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            rows={6}
            maxLength={REASON_MAX + 50}
            placeholder="請說明拒絕原因，這段文字會顯示給提交者"
            className="input font-sans"
            aria-invalid={reasonLen > REASON_MAX}
            aria-describedby={`${titleId}-counter`}
          />
          <div
            id={`${titleId}-counter`}
            className={`mt-1 text-right text-xs ${
              reasonLen > REASON_MAX ? 'text-[--color-error]' : 'text-[--color-text-muted]'
            }`}
          >
            {reasonLen} / {REASON_MAX}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-[--color-error] bg-red-50 px-3 py-2"
            >
              <AlertCircle
                size={16}
                strokeWidth={2.25}
                className="mt-0.5 flex-shrink-0 text-[--color-error]"
              />
              <p className="flex-1 text-sm text-[--color-text-primary]">{errorMessage}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[--color-border] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary"
            aria-busy={submitting}
          >
            {submitting && <Loader2 size={14} strokeWidth={2.25} className="animate-spin" />}
            {submitting ? '送出中...' : '確認拒絕'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectReasonDialog;
