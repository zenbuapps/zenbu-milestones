import {
  AlertCircle,
  Columns2,
  Eye,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ISSUE_BODY_MAX, ISSUE_TITLE_MAX } from 'shared';
import { ApiError, createIssue, uploadImage } from '../data/api';
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
  // 同時上傳中的圖片數（>0 時顯示提示，不 block submit —— 上傳完前送出會留 placeholder 在 body）
  const [uploadingCount, setUploadingCount] = useState(0);
  // 包住 MDEditor 的 div，用來抓內部 textarea 做 cursor 操作
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  // 「獨立全螢幕」state：比 MDEditor 內建那個小按鈕更顯眼，給需要長篇編輯的場景
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  // 預覽模式：edit = 只編輯 / live = 分屏（預設）/ preview = 只預覽
  // 我們自己做 segmented control，搭 CSS 隱藏 MDEditor 原生 toolbar 右側那組
  const [previewMode, setPreviewMode] = useState<'edit' | 'live' | 'preview'>('live');
  // fullscreen 時編輯器高度綁 window.innerHeight；非 fullscreen 固定 320px
  const [editorHeight, setEditorHeight] = useState(320);
  const { showToast } = useToast();

  // 依 fullscreen 與 window size 調整編輯器高度
  useEffect(() => {
    if (!isEditorFullscreen) {
      setEditorHeight(320);
      return;
    }
    const update = () => setEditorHeight(Math.max(400, window.innerHeight - 200));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isEditorFullscreen]);

  // Fullscreen 時攔截 ESC：優先結束 fullscreen 而非關閉 Dialog
  // 用 capture phase 確保先於 Dialog 的 keydown listener 執行
  useEffect(() => {
    if (!isEditorFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsEditorFullscreen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isEditorFullscreen]);

  // fullscreen 時鎖 body scroll（雖然 Dialog 已鎖，保險多鎖一次；卸載時還原）
  useEffect(() => {
    if (!isEditorFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isEditorFullscreen]);

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

  // ============================================================
  // 圖片上傳（M5）：paste / drop image → 上傳到 Bunny → 替換成 markdown link
  // ============================================================

  /** 在當前游標位置插入文字，並把游標移到插入後的尾端 */
  const insertAtCursor = useCallback((insertion: string) => {
    const ta = editorWrapperRef.current?.querySelector('textarea');
    if (!ta) {
      // fallback：append 到尾端
      setBody((prev) => prev + insertion);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    setBody((prev) => prev.slice(0, start) + insertion + prev.slice(end));
    // 下次 render 後把游標推到插入內容後方並維持 focus
    requestAnimationFrame(() => {
      const ta2 = editorWrapperRef.current?.querySelector('textarea');
      if (ta2) {
        const pos = start + insertion.length;
        ta2.selectionStart = pos;
        ta2.selectionEnd = pos;
        ta2.focus();
      }
    });
  }, []);

  /** 把 body 內的某段文字一比一替換（給 placeholder → real markdown 用） */
  const replaceInBody = useCallback((needle: string, replacement: string) => {
    setBody((prev) => prev.split(needle).join(replacement));
  }, []);

  /** 上傳一張圖片：先插 placeholder → 上傳 → 替換成真 markdown */
  const uploadOneImage = useCallback(
    async (file: File) => {
      // 用 8 字 random suffix 確保 placeholder 在 body 內 unique（避免使用者
      // 連貼兩張一樣檔名的圖時 replace 換錯位）
      const tag = Math.random().toString(36).slice(2, 10);
      const displayName = file.name || `pasted-${Date.now()}.png`;
      const placeholder = `![上傳中 ${displayName} #${tag}]()`;
      // 前後加換行避免黏到既有文字
      insertAtCursor(`\n${placeholder}\n`);
      setUploadingCount((c) => c + 1);
      try {
        const res = await uploadImage(file, displayName);
        replaceInBody(placeholder, `![${res.filename}](${res.url})`);
      } catch (err) {
        replaceInBody(placeholder, '');
        const msg = err instanceof ApiError ? err.message : (err as Error).message;
        showToast({ type: 'error', message: `圖片上傳失敗：${msg}` });
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    },
    [insertAtCursor, replaceInBody, showToast],
  );

  /** Ctrl+V / Cmd+V 截圖貼上 */
  const handleEditorPaste = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        images.forEach((f) => void uploadOneImage(f));
      }
    },
    [uploadOneImage],
  );

  /** 從檔案總管拖一張圖進編輯器 */
  const handleEditorDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length > 0) {
        e.preventDefault();
        files.forEach((f) => void uploadOneImage(f));
      }
    },
    [uploadOneImage],
  );

  /** drop 必須配 dragOver 阻止預設行為（不然 browser 會把圖片開成新分頁） */
  const handleEditorDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
    }
  }, []);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="issue-body" className="label">
            內容 <span className="text-[--color-error]">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-[--color-text-muted]">
              <ImagePlus size={12} strokeWidth={2} />
              可貼上 / 拖放圖片
            </span>

            {/* 預覽模式 segmented control（取代 MDEditor 原生那組小 icon） */}
            <div
              role="radiogroup"
              aria-label="預覽模式"
              className="inline-flex overflow-hidden rounded-md border border-[--color-border] text-xs"
            >
              <SegBtn
                active={previewMode === 'edit'}
                onClick={() => setPreviewMode('edit')}
                icon={<Pencil size={12} strokeWidth={2} />}
                label="編輯"
                title="只顯示編輯器（隱藏預覽）"
              />
              <SegBtn
                active={previewMode === 'live'}
                onClick={() => setPreviewMode('live')}
                icon={<Columns2 size={12} strokeWidth={2} />}
                label="分屏"
                title="編輯 + 即時預覽"
              />
              <SegBtn
                active={previewMode === 'preview'}
                onClick={() => setPreviewMode('preview')}
                icon={<Eye size={12} strokeWidth={2} />}
                label="預覽"
                title="只顯示預覽（隱藏編輯器）"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsEditorFullscreen((v) => !v)}
              className="btn-ghost text-xs"
              aria-label={isEditorFullscreen ? '結束全螢幕編輯' : '開啟全螢幕編輯'}
              aria-pressed={isEditorFullscreen}
              title={isEditorFullscreen ? '結束全螢幕（ESC）' : '全螢幕編輯（適合長文）'}
            >
              {isEditorFullscreen ? (
                <Minimize2 size={13} strokeWidth={2} />
              ) : (
                <Maximize2 size={13} strokeWidth={2} />
              )}
              {isEditorFullscreen ? '結束全螢幕' : '全螢幕'}
            </button>
          </div>
        </div>
        <div
          ref={editorWrapperRef}
          data-color-mode="light"
          className={
            isEditorFullscreen
              ? 'fixed inset-0 z-[100] flex flex-col bg-white p-4 shadow-2xl'
              : 'overflow-hidden rounded-lg border border-[--color-border]'
          }
          onPaste={handleEditorPaste}
          onDrop={handleEditorDrop}
          onDragOver={handleEditorDragOver}
        >
          {isEditorFullscreen && (
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[--color-text-primary]">
                全螢幕編輯 — {repoOwner}/{repoName}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditorFullscreen(false)}
                className="btn-secondary"
                aria-label="結束全螢幕編輯"
              >
                <Minimize2 size={14} strokeWidth={2} />
                結束全螢幕（ESC）
              </button>
            </div>
          )}
          <Suspense
            fallback={
              <div className="flex h-64 flex-1 items-center justify-center bg-[--color-surface]">
                <LoadingSpinner size="md" />
              </div>
            }
          >
            <div className={isEditorFullscreen ? 'flex-1 overflow-hidden' : ''}>
              <MDEditor
                id="issue-body"
                value={body}
                onChange={(v) => setBody(v ?? '')}
                height={editorHeight}
                preview={previewMode}
                visibleDragbar={false}
                textareaProps={{
                  placeholder: '支援 Markdown 語法，可即時預覽。截圖後 Ctrl+V 直接貼上',
                  disabled: isSubmitting,
                }}
              />
            </div>
          </Suspense>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 text-[--color-text-muted]">
            {uploadingCount > 0 && (
              <>
                <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                上傳中（{uploadingCount}）...
              </>
            )}
          </span>
          <span
            className={
              bodyOver ? 'text-[--color-error]' : 'text-[--color-text-muted]'
            }
          >
            {bodyLen} / {ISSUE_BODY_MAX}
          </span>
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

/** 預覽模式 segmented control 單格。active 時用 brand 色填滿。 */
const SegBtn = ({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  title: string;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    title={title}
    className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
      active
        ? 'bg-[--color-brand] text-white'
        : 'bg-white text-[--color-text-muted] hover:bg-[--color-surface-overlay]'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default IssueSubmitForm;
