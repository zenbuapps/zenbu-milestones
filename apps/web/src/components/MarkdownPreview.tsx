import { Suspense, lazy } from 'react';

/**
 * MarkdownPreview
 * ---------------------------------------------------------------
 * 將純文字 markdown 渲染為 HTML 的薄包裝。lazy 載入 @uiw/react-md-editor
 * （與 IssueSubmitForm 共用同一 chunk），並一併載入其 CSS，避免主 bundle
 * 在沒打開預覽情境也被拖大。
 *
 * 排版調整集中在 globals.css 的 .markdown-preview-wrap：
 *   - 背景透明（讓父容器 surface 色生效）
 *   - 標題尺度縮減（h1/h2 與 body 字級協調）
 *   - padding 收斂
 */
const MarkdownRenderer = lazy(async () => {
  const [mod] = await Promise.all([
    import('@uiw/react-md-editor'),
    import('@uiw/react-md-editor/markdown-editor.css'),
  ]);
  return { default: mod.default.Markdown };
});

type TMarkdownPreviewProps = {
  /** Markdown 原始文字 */
  source: string;
  /** 外層 className，控制 padding / max-height / font-size 等 */
  className?: string;
};

const MarkdownPreview = ({ source, className }: TMarkdownPreviewProps) => (
  <div data-color-mode="light" className={`markdown-preview-wrap ${className ?? ''}`}>
    <Suspense
      fallback={
        <p className="whitespace-pre-wrap break-words text-xs text-[--color-text-muted]">
          {source}
        </p>
      }
    >
      <MarkdownRenderer source={source} />
    </Suspense>
  </div>
);

export default MarkdownPreview;
