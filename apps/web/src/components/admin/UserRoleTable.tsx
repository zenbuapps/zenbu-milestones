/**
 * UserRoleTable
 * ---------------------------------------------------------------
 * 管理員使用者權限管理頁：列出所有使用者，可指派 / 撤銷 admin role。
 * 右下區塊顯示最近 20 筆稽核 log（折疊式，展開看 payload JSON）。
 *
 * 安全邊界（plan.md §M4）：
 * - 自己的 row 的「切換」按鈕 **disabled** + tooltip（「不可變更自己」）
 * - 後端若回 403「最後一位 admin 不可撤銷」，以 toast 顯示訊息
 *
 * 切換流程：
 *   confirm → PATCH role → 成功 toast + 就地更新 / 失敗 toast
 */

import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, ScrollText, Shield, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AdminUserRow, AuditLogRow, UserRole } from 'shared';
import type { TAppShellContext } from '../../AppShell';
import {
  ApiError,
  fetchAdminUsers,
  fetchAuditLogs,
  updateAdminUserRole,
} from '../../data/api';
import { formatDate, formatTimeAgo } from '../../utils/date';
import EmptyState from '../EmptyState';
import LoadingSpinner from '../LoadingSpinner';
import { useToast } from '../Toast/useToast';

type TUsersFetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; users: AdminUserRow[] };

type TAuditFetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; logs: AuditLogRow[] };

const AUDIT_LIMIT = 20;

const UserRoleTable = () => {
  const { session } = useOutletContext<TAppShellContext>();
  const currentUserId =
    session.state.status === 'authenticated' ? session.state.user.id : null;

  const [usersState, setUsersState] = useState<TUsersFetchState>({ status: 'loading' });
  const [auditState, setAuditState] = useState<TAuditFetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // 載入 users 與 audit logs（並行）
  useEffect(() => {
    let cancelled = false;
    setUsersState({ status: 'loading' });
    setAuditState({ status: 'loading' });

    fetchAdminUsers()
      .then((users) => {
        if (!cancelled) setUsersState({ status: 'ok', users });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : '讀取失敗';
        setUsersState({ status: 'error', message });
      });

    fetchAuditLogs(AUDIT_LIMIT)
      .then((logs) => {
        if (!cancelled) setAuditState({ status: 'ok', logs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : '讀取 audit log 失敗';
        setAuditState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const patchUser = useCallback((row: AdminUserRow) => {
    setUsersState((prev) => {
      if (prev.status !== 'ok') return prev;
      return {
        status: 'ok',
        users: prev.users.map((u) => (u.id === row.id ? row : u)),
      };
    });
  }, []);

  const handleChangeRole = useCallback(
    async (user: AdminUserRow, targetRole: UserRole) => {
      if (user.role === targetRole) return;
      const verb = targetRole === 'admin' ? '授予管理員權限' : '撤銷管理員權限';
      if (!window.confirm(`確定${verb}給 ${user.displayName}（${user.email}）？`)) return;

      setPendingId(user.id);
      try {
        const updated = await updateAdminUserRole(user.id, targetRole);
        patchUser(updated);
        showToast({
          type: 'success',
          message: `已將 ${user.displayName} 更新為 ${targetRole === 'admin' ? '管理員' : '一般使用者'}`,
        });
        // role 變更會寫 audit log，刷一次
        fetchAuditLogs(AUDIT_LIMIT)
          .then((logs) => setAuditState({ status: 'ok', logs }))
          .catch(() => {
            /* 靜默失敗，不打擾 admin */
          });
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : '更新失敗';
        showToast({ type: 'error', message: msg, durationMs: 7000 });
      } finally {
        setPendingId(null);
      }
    },
    [patchUser, showToast],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 使用者列表 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[--color-text-primary]">使用者清單</h3>
          <button
            type="button"
            onClick={refresh}
            className="btn-ghost"
            disabled={usersState.status === 'loading'}
            aria-label="重新整理"
          >
            <RefreshCw
              size={14}
              strokeWidth={2}
              className={usersState.status === 'loading' ? 'animate-spin' : ''}
            />
            <span className="hidden sm:inline">重新整理</span>
          </button>
        </div>

        {usersState.status === 'loading' && (
          <div className="flex min-h-[20vh] items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {usersState.status === 'error' && (
          <div className="card flex items-start gap-3 p-4 text-sm">
            <AlertTriangle
              size={18}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0 text-[--color-error]"
            />
            <div className="flex-1">
              <p className="font-medium text-[--color-error]">讀取失敗</p>
              <p className="mt-1 text-xs text-[--color-text-muted]">{usersState.message}</p>
            </div>
            <button type="button" onClick={refresh} className="btn-secondary">
              重試
            </button>
          </div>
        )}

        {usersState.status === 'ok' && usersState.users.length === 0 && (
          <EmptyState
            icon={User}
            title="尚無使用者紀錄"
            description="首次登入的使用者會自動建立紀錄"
          />
        )}

        {usersState.status === 'ok' && usersState.users.length > 0 && (
          <UserList
            users={usersState.users}
            currentUserId={currentUserId}
            pendingId={pendingId}
            onChangeRole={handleChangeRole}
          />
        )}
      </section>

      {/* 稽核 log */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ScrollText size={16} strokeWidth={2} className="text-[--color-text-muted]" />
          <h3 className="text-sm font-semibold text-[--color-text-primary]">
            最近稽核紀錄（{AUDIT_LIMIT} 筆）
          </h3>
        </div>
        {auditState.status === 'loading' && (
          <div className="flex min-h-[15vh] items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        )}
        {auditState.status === 'error' && (
          <div className="card p-4 text-xs text-[--color-error]">{auditState.message}</div>
        )}
        {auditState.status === 'ok' && auditState.logs.length === 0 && (
          <p className="text-xs text-[--color-text-muted]">暫無稽核紀錄</p>
        )}
        {auditState.status === 'ok' && auditState.logs.length > 0 && (
          <AuditLogList logs={auditState.logs} />
        )}
      </section>
    </div>
  );
};

// ===========================================================================
// UserList
// ===========================================================================

type TUserListProps = {
  users: AdminUserRow[];
  currentUserId: string | null;
  pendingId: string | null;
  onChangeRole: (user: AdminUserRow, role: UserRole) => void;
};

const UserList = ({ users, currentUserId, pendingId, onChangeRole }: TUserListProps) => (
  <div className="overflow-hidden rounded-xl border border-[--color-border] bg-white">
    {/* 桌機 */}
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead className="bg-[--color-surface-overlay] text-left text-xs uppercase tracking-wide text-[--color-text-muted]">
          <tr>
            <th className="px-4 py-3 font-medium">使用者</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">建立時間</th>
            <th className="px-4 py-3 text-right font-medium">動作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-t border-[--color-border] hover:bg-[--color-surface-overlay]"
            >
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt={u.displayName}
                      className="h-7 w-7 rounded-full border border-[--color-border]"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[--color-surface-overlay] text-[11px] font-semibold text-[--color-text-muted]">
                      {u.displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-[--color-text-primary]">
                    {u.displayName}
                  </span>
                  {u.id === currentUserId && (
                    <span className="rounded-full bg-[--color-surface-overlay] px-1.5 text-[10px] font-semibold text-[--color-text-muted]">
                      你
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 align-top text-xs text-[--color-text-muted]">{u.email}</td>
              <td className="px-4 py-3 align-top">
                <RoleBadge role={u.role} />
              </td>
              <td className="px-4 py-3 align-top text-xs text-[--color-text-muted]">
                {formatDate(u.createdAt)}
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center justify-end">
                  <RoleToggle
                    user={u}
                    disabled={u.id === currentUserId || pendingId !== null}
                    pending={pendingId === u.id}
                    isSelf={u.id === currentUserId}
                    onChange={(role) => onChangeRole(u, role)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* 手機 */}
    <div className="flex flex-col divide-y divide-[--color-border] md:hidden">
      {users.map((u) => (
        <div key={u.id} className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl}
                  alt={u.displayName}
                  className="h-7 w-7 rounded-full border border-[--color-border]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[--color-surface-overlay] text-[11px] font-semibold text-[--color-text-muted]">
                  {u.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-[--color-text-primary]">
                  {u.displayName}
                  {u.id === currentUserId && (
                    <span className="ml-1 rounded-full bg-[--color-surface-overlay] px-1.5 text-[10px] font-semibold text-[--color-text-muted]">
                      你
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-[--color-text-muted]">{u.email}</span>
              </div>
            </div>
            <RoleBadge role={u.role} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[--color-text-muted]">
              建立 {formatDate(u.createdAt)}
            </span>
            <RoleToggle
              user={u}
              disabled={u.id === currentUserId || pendingId !== null}
              pending={pendingId === u.id}
              isSelf={u.id === currentUserId}
              onChange={(role) => onChangeRole(u, role)}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const RoleBadge = ({ role }: { role: UserRole }) => {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
        <Shield size={12} strokeWidth={2.25} />
        管理員
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[--color-border] bg-[--color-surface-overlay] px-2 py-0.5 text-[11px] font-medium text-[--color-text-muted]">
      <User size={12} strokeWidth={2.25} />
      使用者
    </span>
  );
};

type TRoleToggleProps = {
  user: AdminUserRow;
  disabled: boolean;
  pending: boolean;
  isSelf: boolean;
  onChange: (role: UserRole) => void;
};

const RoleToggle = ({ user, disabled, pending, isSelf, onChange }: TRoleToggleProps) => {
  const tooltip = isSelf
    ? '不可變更自己的 role'
    : user.role === 'admin'
      ? '撤銷管理員權限'
      : '授予管理員權限';
  return (
    <div className="flex items-center gap-1" title={tooltip}>
      <select
        value={user.role}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as UserRole)}
        aria-label={`變更 ${user.displayName} 的 role`}
        className="input h-8 px-2 py-0 text-xs"
      >
        <option value="user">使用者</option>
        <option value="admin">管理員</option>
      </select>
      {pending && (
        <span
          className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-[--color-border] border-t-[--color-brand]"
          aria-label="處理中"
        />
      )}
    </div>
  );
};

// ===========================================================================
// Audit log 列表
// ===========================================================================

const AuditLogList = ({ logs }: { logs: AuditLogRow[] }) => (
  <ul className="flex flex-col gap-2">
    {logs.map((log) => (
      <AuditLogItem key={log.id} log={log} />
    ))}
  </ul>
);

const ACTION_LABELS: Record<string, string> = {
  'role.grant': '授予管理員',
  'role.revoke': '撤銷管理員',
  'repo.update': '更新 repo 設定',
  'issue.approve': '通過 issue',
  'issue.reject': '拒絕 issue',
};

const AuditLogItem = ({ log }: { log: AuditLogRow }) => {
  const [expanded, setExpanded] = useState(false);
  const actionLabel = ACTION_LABELS[log.action] ?? log.action;

  const payloadText = useMemo(() => {
    try {
      return JSON.stringify(log.payload, null, 2);
    } catch {
      return String(log.payload);
    }
  }, [log.payload]);

  return (
    <li className="card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-[--color-text-primary]">
              {log.actor.displayName}
            </span>
            <span className="text-[--color-text-muted]">執行</span>
            <span className="rounded bg-[--color-surface-overlay] px-1.5 py-0.5 font-mono text-[10px] text-[--color-text-secondary]">
              {actionLabel}
            </span>
            <span className="text-[--color-text-muted]">
              · 對象 {log.targetType}:{log.targetId}
            </span>
          </div>
          <time dateTime={log.createdAt} className="mt-1 block text-[11px] text-[--color-text-muted]">
            {formatTimeAgo(log.createdAt)}
          </time>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-ghost p-1"
          aria-label={expanded ? '收起 payload' : '展開 payload'}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp size={14} strokeWidth={2} />
          ) : (
            <ChevronDown size={14} strokeWidth={2} />
          )}
        </button>
      </div>
      {expanded && (
        <pre className="mt-2 overflow-x-auto rounded bg-[--color-surface-overlay] p-2 text-[11px] text-[--color-text-secondary]">
          {payloadText}
        </pre>
      )}
    </li>
  );
};

export default UserRoleTable;
