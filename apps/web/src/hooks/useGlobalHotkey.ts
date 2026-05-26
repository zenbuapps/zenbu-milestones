import { useEffect } from 'react';

/**
 * 註冊全域 Ctrl+K / Cmd+K（或自訂組合）的鍵盤事件。
 *
 * 設計考量：
 * - 在 `input` / `textarea` / `contenteditable` 內按下時依然觸發 —— 命令面板的設計就是要從
 *   任何地方都能呼叫；macOS 慣例的 Cmd+K 與 Windows / Linux 的 Ctrl+K 一致對應，且不會
 *   與瀏覽器原生快捷鍵衝突（preventDefault 防止 Firefox 把 focus 帶到網址列搜尋）。
 * - handler 透過閉包；effect 重新註冊以拿到最新 handler，避免 stale closure。
 */
export const useGlobalHotkey = (
  /** 偵測是否符合目標組合鍵；回 true 才呼叫 onMatch */
  matcher: (e: KeyboardEvent) => boolean,
  onMatch: (e: KeyboardEvent) => void,
): void => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matcher(e)) {
        e.preventDefault();
        onMatch(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [matcher, onMatch]);
};

/** 判斷 `Ctrl+K`（Win/Linux）或 `Cmd+K`（macOS） */
export const isCmdK = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k';
