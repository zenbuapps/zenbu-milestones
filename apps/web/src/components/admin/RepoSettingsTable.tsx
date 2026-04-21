/**
 * RepoSettingsTable
 * ---------------------------------------------------------------
 * 管理員 repo 投稿設定頁：逐 repo 切換 canSubmitIssue / visibleOnUI。
 *
 * 互動策略（plan.md §M4）：
 * - Toggle 切換「立即 PATCH」（optimistic update）：UI 先變，失敗 revert 並顯示 toast
 * - 空列表顯示 EmptyState 提示「等每小時 cron 建立」
 * - M4 不做「手動新增 repo」
 *
 * Toggle 視覺採 role="switch" + 純 Tailwind 實作，避免引入新依賴。
 */

import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { RepoSettingsRow, UpdateRepoSettingsInput } from 'shared';
import { ApiError, fetchAdminRepos, updateAdminRepoSettings } from '../../data/api';
import { formatTimeAgo } from '../../utils/date';
import EmptyState from '../EmptyState';
import LoadingSpinner from '../LoadingSpinner';
import { useToast } from '../Toast/useToast';

type TFetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; repos: RepoSettingsRow[] };

const RepoSettingsTable = () => {
  const [state, setState] = useState<TFetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const { showToast } = useToast();

  // 正在切換的 repo key（`owner/name`）—— 用於顯示 disabled + spinner
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAdminRepos()
      .then((repos) => {
        if (!cancelled) setState({ status: 'ok', repos });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : '讀取失敗';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const makeKey = (owner: string, name: string): string => `${owner}/${name}`;

  const patchRow = useCallback((row: RepoSettingsRow) => {
    setState((prev) => {
      if (prev.status !== 'ok') return prev;
      return {
        status: 'ok',
        repos: prev.repos.map((r) => (r.id === row.id ? row : r)),
      };
    });
  }, []);

  /** optimistic：先改前端再打 API；失敗 revert */
  const handleToggle = useCallback(
    async (row: RepoSettingsRow, field: keyof UpdateRepoSettingsInput, nextValue: boolean) => {
      const key = makeKey(row.repoOwner, row.repoName);
      if (pendingKeys.has(key)) return;

      // Optimistic UI
      const optimistic: RepoSettingsRow = { ...row, [field]: nextValue };
      patchRow(optimistic);
      setPendingKeys((s) => new Set(s).add(key));

      try {
        const server = await updateAdminRepoSettings(row.repoOwner, row.repoName, {
          [field]: nextValue,
        });
        patchRow(server);
      } catch (err) {
        // Revert
        patchRow(row);
        const msg = err instanceof ApiError ? err.message : '更新失敗，請稍後重試';
        showToast({ type: 'error', message: `${key} 更新失敗：${msg}` });
      } finally {
        setPendingKeys((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      }
    },
    [patchRow, pendingKeys, showToast],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={refresh}
          className="btn-ghost"
          disabled={state.status === 'loading'}
          aria-label="重新整理"
        >
          <RefreshCw
            size={14}
            strokeWidth={2}
            className={state.status === 'loading' ? 'animate-spin' : ''}
          />
          <span className="hidden sm:inline">重新整理</span>
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="card flex items-start gap-3 p-4 text-sm">
          <AlertTriangle
            size={18}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0 text-[--color-error]"
          />
          <div className="flex-1">
            <p className="font-medium text-[--color-error]">讀取失敗</p>
            <p className="mt-1 text-xs text-[--color-text-muted]">{state.message}</p>
          </div>
          <button type="button" onClick={refresh} className="btn-secondary">
            重試
          </button>
        </div>
      )}

      {state.status === 'ok' && state.repos.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="尚無 repo settings"
          description="每小時的 fetcher cron 會自動建立 repo 設定紀錄。若已設 token 仍看不到，請確認後端 fetcher 已至少執行一次。"
        />
      )}

      {state.status === 'ok' && state.repos.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[--color-border] bg-white">
          {/* 桌機 table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-[--color-surface-overlay] text-left text-xs uppercase tracking-wide text-[--color-text-muted]">
                <tr>
                  <th className="px-4 py-3 font-medium">Repo</th>
                  <th className="px-4 py-3 font-medium">可投稿</th>
                  <th className="px-4 py-3 font-medium">顯示於 UI</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody>
                {state.repos.map((row) => {
                  const key = makeKey(row.repoOwner, row.repoName);
                  const pending = pendingKeys.has(key);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-[--color-border] hover:bg-[--color-surface-overlay]"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col">
                          <a
                            href={`/#/repo/${encodeURIComponent(row.repoName)}`}
                            className="text-sm font-medium text-[--color-text-primary] hover:text-[--color-brand]"
                          >
                            {row.repoOwner}/{row.repoName}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ToggleSwitch
                          checked={row.canSubmitIssue}
                          disabled={pending}
                          label={`${row.repoName} 可投稿`}
                          onChange={(v) => handleToggle(row, 'canSubmitIssue', v)}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ToggleSwitch
                          checked={row.visibleOnUI}
                          disabled={pending}
                          label={`${row.repoName} 顯示於 UI`}
                          onChange={(v) => handleToggle(row, 'visibleOnUI', v)}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-[--color-text-muted]">
                        {row.updatedBy?.displayName ?? '—'}
                        <br />
                        <time dateTime={row.updatedAt}>{formatTimeAgo(row.updatedAt)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 手機 stacked card */}
          <div className="flex flex-col divide-y divide-[--color-border] md:hidden">
            {state.repos.map((row) => {
              const key = makeKey(row.repoOwner, row.repoName);
              const pending = pendingKeys.has(key);
              return (
                <div key={row.id} className="flex flex-col gap-3 p-4">
                  <a
                    href={`/#/repo/${encodeURIComponent(row.repoName)}`}
                    className="text-sm font-medium text-[--color-text-primary] hover:text-[--color-brand]"
                  >
                    {row.repoOwner}/{row.repoName}
                  </a>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[--color-text-muted]">可投稿</span>
                    <ToggleSwitch
                      checked={row.canSubmitIssue}
                      disabled={pending}
                      label={`${row.repoName} 可投稿`}
                      onChange={(v) => handleToggle(row, 'canSubmitIssue', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[--color-text-muted]">顯示於 UI</span>
                    <ToggleSwitch
                      checked={row.visibleOnUI}
                      disabled={pending}
                      label={`${row.repoName} 顯示於 UI`}
                      onChange={(v) => handleToggle(row, 'visibleOnUI', v)}
                    />
                  </div>
                  <div className="text-[11px] text-[--color-text-muted]">
                    最近更新：{row.updatedBy?.displayName ?? '—'} ·{' '}
                    <time dateTime={row.updatedAt}>{formatTimeAgo(row.updatedAt)}</time>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

type TToggleSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

/**
 * 純 Tailwind toggle，語意為 `role="switch"`，支援鍵盤 Space 切換。
 */
const ToggleSwitch = ({ checked, disabled, label, onChange }: TToggleSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[--color-brand-ring] focus:ring-offset-1 ${
      checked ? 'bg-[--color-brand]' : 'bg-[--color-surface-overlay]'
    } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

export default RepoSettingsTable;
