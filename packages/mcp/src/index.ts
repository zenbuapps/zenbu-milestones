/**
 * Zenbu Roadmaps MCP Server
 * ---------------------------------------------------------------
 * stdio MCP server，讓本地 Claude Code（或其他 MCP client）能：
 *   - 一般使用者：對指定 repo 提出 issue 草稿、列出/撤銷自己的 issue
 *   - 管理員：列出待審核 issue、通過、拒絕
 *
 * 認證方式（v1，最小侵入後端）：
 *   使用者先用瀏覽器登入 zenbu-roadmaps（Google OAuth），打開 DevTools 把
 *   `connect.sid` cookie 值貼到 MCP client 的環境變數。MCP server 在每個
 *   HTTP 請求帶上 `Cookie: connect.sid=<value>`，後端的 AuthenticatedGuard
 *   把這個 session 視同瀏覽器登入；admin 端再經 AdminGuard 比對 role。
 *
 *   優點：完全不需要動後端、不必另外做 PAT 機制。
 *   缺點：cookie 7 天到期後要重新貼。
 *
 * 必要環境變數：
 *   ZENBU_ROADMAPS_API_URL    例：https://roadmaps.zenbuapps.com 或 http://localhost:3000
 *   ZENBU_ROADMAPS_SESSION    `connect.sid` cookie 的 raw value（含 `s%3A` 前綴）
 *
 * 啟動方式（給 Claude Code 的 mcp config）：
 *   {
 *     "mcpServers": {
 *       "zenbu-roadmaps": {
 *         "command": "npx",
 *         "args": ["-y", "@zenbuapps/zenbu-roadmaps-mcp"],
 *         "env": {
 *           "ZENBU_ROADMAPS_API_URL": "https://roadmaps.zenbuapps.com",
 *           "ZENBU_ROADMAPS_SESSION": "s%3A..."
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

const API_URL_RAW = process.env.ZENBU_ROADMAPS_API_URL;
const SESSION_RAW = process.env.ZENBU_ROADMAPS_SESSION;

if (!API_URL_RAW) {
  console.error(
    '[zenbu-roadmaps-mcp] ZENBU_ROADMAPS_API_URL 未設定。請在 mcp config 的 env 中提供，例：https://roadmaps.zenbuapps.com',
  );
  process.exit(1);
}
if (!SESSION_RAW) {
  console.error(
    '[zenbu-roadmaps-mcp] ZENBU_ROADMAPS_SESSION 未設定。請在瀏覽器登入後從 DevTools → Application → Cookies 複製 `connect.sid` 的值（包含 s%3A 前綴）',
  );
  process.exit(1);
}

const API_URL = API_URL_RAW.replace(/\/$/, '');
const SESSION_COOKIE = `connect.sid=${SESSION_RAW}`;

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
}

class ApiError extends Error {
  constructor(public readonly httpStatus: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const headers = new Headers();
  headers.set('Cookie', SESSION_COOKIE);
  headers.set('Accept', 'application/json');
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON response (e.g. proxied 502 HTML)
  }

  if (!res.ok) {
    if (
      payload &&
      typeof payload === 'object' &&
      'success' in payload &&
      (payload as { success: unknown }).success === false &&
      'error' in payload
    ) {
      const err = (payload as { error: { code?: unknown; message?: unknown } }).error;
      const code = typeof err.code === 'string' ? err.code : `HTTP_${res.status}`;
      const message = typeof err.message === 'string' ? err.message : res.statusText;
      throw new ApiError(res.status, code, message);
    }
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
    ) {
      throw new ApiError(res.status, `HTTP_${res.status}`, (payload as { message: string }).message);
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed');
  }

  // unwrap envelope when present
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as { success: unknown }).success === true &&
    'data' in payload
  ) {
    return (payload as Envelope<T> & { success: true }).data;
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// 共用：把 API 結果包成 MCP tool 的 content envelope
// ---------------------------------------------------------------------------

type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function jsonResult(label: string, data: unknown): McpToolResult {
  return {
    content: [
      { type: 'text', text: `${label}\n\n${JSON.stringify(data, null, 2)}` },
    ],
  };
}

function errorResult(prefix: string, err: unknown): McpToolResult {
  let detail: string;
  if (err instanceof ApiError) {
    detail = `[HTTP ${err.httpStatus} ${err.code}] ${err.message}`;
    if (err.httpStatus === 401) {
      detail += '\n\n提示：session 可能已失效。請在瀏覽器重新登入後，重新從 DevTools 複製 connect.sid 並更新 mcp config 的 ZENBU_ROADMAPS_SESSION。';
    } else if (err.httpStatus === 403) {
      detail += '\n\n提示：權限不足。Admin 工具僅限 role=admin 的使用者使用。';
    }
  } else if (err instanceof Error) {
    detail = err.message;
  } else {
    detail = String(err);
  }
  return {
    content: [{ type: 'text', text: `${prefix}：${detail}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zenbu-roadmaps',
  version: '0.1.0',
});

// ---- 一般使用者工具 -------------------------------------------------------

server.tool(
  'submit_issue',
  '對指定 repo 提出一筆 issue 草稿。送出後會進入 zenbu-roadmaps 後台審核佇列，由 admin 通過後才會代為轉送到 GitHub。',
  {
    repoName: z
      .string()
      .min(1)
      .describe('目標 repo 名稱（zenbuapps org 底下，例：zenbu-cms）'),
    title: z.string().min(1).max(255).describe('issue 標題'),
    body: z.string().min(1).describe('issue 內文（Markdown）'),
    repoOwner: z
      .string()
      .default('zenbuapps')
      .describe('repo 所有者，預設 zenbuapps（目前後端僅支援此 org）'),
  },
  async ({ repoName, title, body, repoOwner }) => {
    try {
      const result = await api<{ id: string; status: string }>('/api/issues', {
        method: 'POST',
        body: { repoOwner, repoName, title, body },
      });
      return jsonResult(
        `已送出 issue 草稿到 ${repoOwner}/${repoName}，目前狀態：${result.status}`,
        result,
      );
    } catch (err) {
      return errorResult('提出 issue 失敗', err);
    }
  },
);

server.tool(
  'list_my_issues',
  '列出當前登入使用者自己送過的 issue 草稿（含各種狀態：pending / approved / rejected / synced-to-github）。',
  {},
  async () => {
    try {
      const issues = await api<unknown[]>('/api/me/issues');
      return jsonResult(`你提交過的 issue（共 ${issues.length} 筆）`, issues);
    } catch (err) {
      return errorResult('讀取 my issues 失敗', err);
    }
  },
);

server.tool(
  'withdraw_my_issue',
  '撤銷自己提交但尚在待審核（pending）狀態的 issue。已通過 / 已拒絕 / 已轉 GitHub 的不可撤銷。',
  {
    issueId: z.string().min(1).describe('issue 的 UUID，可由 list_my_issues 取得'),
  },
  async ({ issueId }) => {
    try {
      await api<{ id: string }>(`/api/me/issues/${encodeURIComponent(issueId)}`, {
        method: 'DELETE',
      });
      return jsonResult('已撤銷 issue', { id: issueId });
    } catch (err) {
      return errorResult('撤銷 issue 失敗', err);
    }
  },
);

// ---- Admin 工具 -----------------------------------------------------------

server.tool(
  'list_admin_issues',
  '【Admin only】列出所有使用者提交的 issue。可選擇依狀態過濾。',
  {
    status: z
      .enum(['pending', 'approved', 'rejected', 'synced-to-github', 'all'])
      .default('pending')
      .describe('狀態過濾，預設 pending（待審核）'),
  },
  async ({ status }) => {
    try {
      const rows = await api<unknown[]>('/api/admin/issues', {
        query: { status },
      });
      return jsonResult(`Admin issue 列表（status=${status}，共 ${rows.length} 筆）`, rows);
    } catch (err) {
      return errorResult('讀取 admin issues 失敗', err);
    }
  },
);

server.tool(
  'approve_issue',
  '【Admin only】通過一筆待審核 issue，後端會代為呼叫 GitHub API 建立真實 issue 並把狀態推進到 synced-to-github。',
  {
    issueId: z.string().min(1).describe('issue UUID'),
  },
  async ({ issueId }) => {
    try {
      const result = await api<unknown>(
        `/api/admin/issues/${encodeURIComponent(issueId)}/approve`,
        { method: 'POST' },
      );
      return jsonResult('通過完成', result);
    } catch (err) {
      return errorResult('通過 issue 失敗', err);
    }
  },
);

server.tool(
  'reject_issue',
  '【Admin only】拒絕一筆待審核 issue，需要提供拒絕原因（會顯示給投稿者）。',
  {
    issueId: z.string().min(1).describe('issue UUID'),
    reason: z.string().min(1).max(500).describe('拒絕原因，會被回填到 issue 上展示給投稿者'),
  },
  async ({ issueId, reason }) => {
    try {
      const result = await api<unknown>(
        `/api/admin/issues/${encodeURIComponent(issueId)}/reject`,
        {
          method: 'POST',
          body: { reason },
        },
      );
      return jsonResult('已拒絕', result);
    } catch (err) {
      return errorResult('拒絕 issue 失敗', err);
    }
  },
);

// ---------------------------------------------------------------------------
// 啟動
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 不要 console.log（會污染 stdio），用 stderr 印啟動訊息
  console.error('[zenbu-roadmaps-mcp] ready · API=' + API_URL);
}

main().catch((err: unknown) => {
  console.error('[zenbu-roadmaps-mcp] fatal:', err);
  process.exit(1);
});
