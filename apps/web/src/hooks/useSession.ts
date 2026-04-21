import { useCallback, useEffect, useState } from 'react';
import type { SessionUserDTO } from 'shared';
import { ApiError, apiFetch, authUrls, isApiConfigured } from '../data/api';

/**
 * 登入狀態 state machine：
 * - `loading`：正在查 /api/me
 * - `unavailable`：VITE_API_BASE_URL 未設 → 整個寫入功能 graceful disabled
 * - `unauthenticated`：API 可用但未登入
 * - `authenticated`：API 可用且已登入
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: SessionUserDTO };

export interface UseSessionResult {
  state: SessionState;
  /** 重新查一次 /api/me */
  refresh: () => void;
  /** 跳轉到 Google 登入頁（full page redirect，回來時 session 已建立） */
  login: () => void;
  /** 跳轉到後端 logout（清 session 後 redirect 回前端） */
  logout: () => void;
}

/**
 * 讀取當前登入狀態，並提供 login / logout / refresh action。
 * 此 hook 在 AppShell 掛載時呼叫一次；子元件直接讀結果即可（未做 context 聚合 —— M1 簡化）。
 */
export function useSession(): UseSessionResult {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isApiConfigured()) {
      setState({ status: 'unavailable' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch<SessionUserDTO>('/api/me')
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 401 / 其他錯誤一律視為未登入；避免誤顯錯誤 toast
        if (err instanceof ApiError && err.httpStatus === 401) {
          setState({ status: 'unauthenticated' });
        } else if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
          // 後端沒起或 tunnel 掛了 —— 先當未登入，UI 上還是能瀏覽唯讀內容
          setState({ status: 'unauthenticated' });
        } else {
          setState({ status: 'unauthenticated' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const login = useCallback(() => {
    const url = authUrls.login();
    if (url) window.location.href = url;
  }, []);

  const logout = useCallback(() => {
    const url = authUrls.logout();
    if (url) window.location.href = url;
  }, []);

  return { state, refresh, login, logout };
}
