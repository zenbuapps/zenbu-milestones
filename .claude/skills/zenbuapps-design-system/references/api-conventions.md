# API 約定與 Auth Token

ZenbuApps 系列產品共通的 API 介面規範與身份驗證 token 命名約定。

---

## 分頁回應格式

所有列表 API 統一回傳：

```typescript
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### 前端查詢範例

```typescript
api.get(`/items?search=${search}&page=${page}&limit=20`).then(r => r.data)
// r.data = { data: T[], total: number, page: number, limit: number }
```

### React Query 整合範例

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['items', search, page],
  queryFn: () => api.get(`/items?search=${search}&page=${page}&limit=20`).then(r => r.data),
});

const items = data?.data ?? [];
const total = data?.total ?? 0;
```

---

## Auth Token 命名約定

### 各產品對應表

| 產品 | localStorage key | Cookie name |
|------|-----------------|-------------|
| ZenbuSign | `ps_access_token` | `refresh_token` |
| ZenbuCRM | `crm_access_token` | `crm_refresh_token` |
| ZenbuHR | `hr_access_token` | `hr_refresh_token` |
| ZenbuFinance | `pf_access_token` | `pf_refresh_token` |

### 命名規則

每個產品使用獨立的 token key，避免跨產品干擾。命名格式：

```
{prefix}_access_token   # localStorage
{prefix}_refresh_token  # Cookie
```

新產品命名前綴建議：

| 產品 | prefix |
|---|---|
| ZenbuForm | `pf_form` 或約定簡碼 |
| 新 Power 系列產品 | 取 2-3 字母簡碼，避開既有 prefix |

### 實作要點

- localStorage 存放 access token（短效，用於 API request header）。
- Cookie（HttpOnly）存放 refresh token（長效，由後端管理）。
- API client 在 401 時自動使用 refresh token 換取新 access token。
- 登出時必須清除 localStorage 的 access token，並請求後端清除 cookie。

---

## API Client 慣例

範例 axios instance：

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,  // 帶上 cookie（refresh token）
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('xx_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // refresh token 流程，成功後重試 original request
    }
    return Promise.reject(error);
  }
);
```
