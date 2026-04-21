import { AlertCircle, Loader2 } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { ISSUE_BODY_MAX, ISSUE_TITLE_MAX } from 'shared';
import { ApiError, createIssue } from '../data/api';
import LoadingSpinner from './LoadingSpinner';
import { useToast } from './Toast/useToast';

// Markdown 編輯器採用 lazy import，避免拖垮 initial bundle
// （MDEditor + rehype/remark 相依加起來數百 KB）
// 同步匯入其 CSS，否則預覽樣式會崩掉
const MDEditor = lazy(async () => {
  const [module] = await Promise.all([
    import('@uiw/react-md-editor'),
    import('@uiw/react-md-editor/markdown-editor.css'),
  ]);
  return { default: module.default };
});

/** 預填的 body 範本，降低使用者面對空白編輯器的門檻 */
const DEFAULT_BODY_TEMPLATE = `## 描述

（請描述你要回報的問題或建議）

## 重現步驟（可選）
1. ...
2. ...

## 其他資訊

`;

/** 提交流程的狀態機 */
type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: FormError };

/** 呈現給使用者的錯誤資訊 */
interface FormError {
  /** 主要文案 */
  message: string;
  /** 是否提示重新登入 CTA */
  needsLogin?: boolean;
}

type TIssueSubmitFormProps = {
  /** 目標 repo 的 owner（目前皆為 'zenbuapps'） */
  repoOwner: string;
  /** 目標 repo 名稱 */
  repoName: string;
  /** 送出成功後觸發（例如關閉 Dialog） */
  onSuccess: () => void;
  /** 表單內容是否有變動（讓父層決定是否需要 confirm 才能關閉） */
  onDirtyChange?: (dirty: boolean) => void;
  /** 登入按鈕被點擊時呼叫（僅在 401 錯誤時顯示） */
  onRequestLogin?: () => void;
};

/**
 * Issue 草稿提交表單。
 *
 * 負責：
 * - 標題（單行 + 即時字數 counter）
 * - Markdown 內容（lazy MDEditor + 預填範本）
 * - 提交狀態機（idle → submitting → success / error）
 * - 錯誤 inline 顯示 + toast；成功 toast + 2s 後 onSuccess 回呼
 *
 * 不負責：Dialog 外殼（由 `IssueSubmitDialog` 處理）
 */
const IssueSubmitForm = ({
  repoOwner,
  repoName,
  onSuccess,
  onDirtyChange,
  onRequestLogin,
}: TIssueSubmitFormProps) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState<string>(DEFAULT_BODY_TEMPLATE);
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const { showToast } = useToast();

  const titleLen = title.length;
  const titleOver = titleLen > ISSUE_TITLE_MAX;
  const bodyLen = body.length;
  const bodyOver = bodyLen > ISSUE_BODY_MAX;

  // 「髒狀態」判斷 —— 使用者動過任一欄位才算 dirty（預設範本不算）
  const isDirty = useMemo(
    () => title.trim() !== '' || body.trim() !== DEFAULT_BODY_TEMPLATE.trim(),
    [title, body],
  );

  // 通知父層 dirty 狀態，以便 Dialog 關閉時做 confirm
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const isSubmitting = state.status === 'submitting';
  const canSubmit =
    !isSubmitting &&
    title.trim().length > 0 &&
    !titleOver &&
    body.trim().length > 0 &&
    !bodyOver;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setState({ status: 'submitting' });
      try {
        await createIssue({
          title: title.trim(),
          body,
          repoOwner,
          repoName,
        });
        setState({ status: 'success' });
        showToast({
          type: 'success',
          message: '草稿已送出，待管理員審核',
          linkText: '查看我的 issue',
          // M3 才會實作 /me/issues；此處先放連結，未建成前點擊會 404 回主頁
          linkUrl: '/#/me/issues',
        });
        // 2s 後關閉 dialog（由父層實作 onSuccess）
        window.setTimeout(onSuccess, 2000);
      } catch (err) {
        setState({ status: 'error', error: deriveFormError(err) });
      }
    },
    [body, canSubmit, onSuccess, repoName, repoOwner, showToast, title],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* 標題 */}
      <div>
        <label htmlFor="issue-title" className="label">
          標題 <span className="text-[--color-error]">*</span>
        </label>
        <input
          id="issue-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          // 讓 UI 警示超出，而非硬截斷；提交時再做最終驗證
          maxLength={ISSUE_TITLE_MAX + 50}
          disabled={isSubmitting}
          placeholder="簡短描述你要回報的問題或建議"
          className="input"
          required
          aria-invalid={titleOver}
          aria-describedby="issue-title-counter"
        />
        <div
          id="issue-title-counter"
          className={`mt-1 text-right text-xs ${
            titleOver ? 'text-[--color-error]' : 'text-[--color-text-muted]'
          }`}
        >
          {titleLen} / {ISSUE_TITLE_MAX}
        </div>
      </div>

      {/* 內容 */}
      <div>
        <label htmlFor="issue-body" className="label">
          內容 <span className="text-[--color-error]">*</span>
        </label>
        <div
          data-color-mode="light"
          className="overflow-hidden rounded-lg border border-[--color-border]"
        >
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center bg-[--color-surface]">
                <LoadingSpinner size="md" />
              </div>
            }
          >
            <MDEditor
              id="issue-body"
              value={body}
              onChange={(v) => setBody(v ?? '')}
              height={320}
              preview="live"
              visibleDragbar={false}
              textareaProps={{
                placeholder: '支援 Markdown 語法，可即時預覽',
                disabled: isSubmitting,
              }}
            />
          </Suspense>
        </div>
        <div
          className={`mt-1 text-right text-xs ${
            bodyOver ? 'text-[--color-error]' : 'text-[--color-text-muted]'
          }`}
        >
          {bodyLen} / {ISSUE_BODY_MAX}
        </div>
      </div>

      {/* Inline error 區塊 */}
      {state.status === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[--color-error] bg-red-50 px-3 py-2"
        >
          <AlertCircle
            size={16}
            strokeWidth={2.25}
            className="mt-0.5 flex-shrink-0 text-[--color-error]"
          />
          <div className="flex-1 text-sm text-[--color-text-primary]">
            {state.error.message}
            {state.error.needsLogin && onRequestLogin && (
              <button
                type="button"
                onClick={onRequestLogin}
                className="ml-2 text-[--color-brand] underline hover:brightness-90"
              >
                重新登入
              </button>
            )}
          </div>
        </div>
      )}

      {/* 送出區 */}
      <div className="flex items-center justify-end gap-3 border-t border-[--color-border] pt-4">
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary"
          aria-busy={isSubmitting}
        >
          {isSubmitting && (
            <Loader2 size={14} strokeWidth={2.25} className="animate-spin" />
          )}
          {state.status === 'success' ? '已送出' : isSubmitting ? '送出中...' : '送出草稿'}
        </button>
      </div>
    </form>
  );
};

/**
 * 把 ApiError 或未知錯誤對應到使用者友善文案。
 * 對照表見 M2 prompt 的錯誤處理區塊。
 */
function deriveFormError(err: unknown): FormError {
  if (!(err instanceof ApiError)) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return { message: `建立失敗：${message}（稍後重試）` };
  }
  // 401：session 失效
  if (err.httpStatus === 401) {
    return { message: '登入已失效，請重新登入', needsLogin: true };
  }
  // 網路異常
  if (err.code === 'NETWORK_ERROR') {
    return { message: '網路異常，請稍後重試' };
  }
  // 400 / INVALID_PAYLOAD：顯示後端訊息
  if (err.httpStatus === 400 || err.code === 'INVALID_PAYLOAD') {
    return { message: err.message || '送出內容驗證失敗' };
  }
  // 403：repo 暫不接受投稿 / 權限不足
  if (err.httpStatus === 403) {
    return { message: err.message || '此 repo 暫不接受投稿' };
  }
  // 429：rate limit
  if (err.httpStatus === 429) {
    return { message: '送出太頻繁，請稍後再試' };
  }
  return { message: `建立失敗：${err.message}（稍後重試）` };
}

export default IssueSubmitForm;
