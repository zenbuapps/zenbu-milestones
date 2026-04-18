# 頁面範本

ZenbuApps 系列產品的標準頁面範本。所有新頁面應從此處複製對應範本起步。

> **共通原則**：頁面外層使用 `p-6`，**禁止加 `max-w-*`**（Modal 除外）。

---

## 列表頁（List Page）

```tsx
export const XxxListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['xxx', search, page],
    queryFn: () => api.get(`/xxx?search=${search}&page=${page}&limit=20`).then(r => r.data),
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6">  {/* 不加 max-w */}
      <PageHeader
        title="頁面標題"
        description={`共 ${total} 筆`}
        action={<Link to="/xxx/new" className="btn-primary gap-2"><Plus size={16} />新增</Link>}
      />

      {/* 搜尋 */}
      <div className="relative max-w-sm mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--color-text-muted]" />
        <input className="input pl-8 py-1.5 text-xs" placeholder="搜尋..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : !items.length ? (
        <EmptyState icon={<Icon size={48} />} title="尚無資料" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            {/* ... */}
          </table>
        </div>
      )}
    </div>
  );
};
```

---

## 詳情 / 編輯頁（Detail Page）

```tsx
export const XxxDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['xxx', id],
    queryFn: () => api.get(`/xxx/${id}`).then(r => r.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (!data) return <div className="p-6 text-[--color-error]">找不到資料</div>;

  return (
    <div className="p-6">  {/* 不加 max-w */}
      <button onClick={() => navigate(-1)} className="btn-ghost text-xs gap-1.5 mb-4 -ml-1">
        <ArrowLeft size={14} /> 返回列表
      </button>

      <PageHeader
        title={data.name}
        action={
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-secondary">取消</button>
                <button onClick={handleSave} className="btn-primary gap-2">
                  <Save size={15} />儲存
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 card p-6 space-y-4">
          {/* 主要內容 */}
        </div>
        <div className="space-y-4">
          {/* 側邊資訊 */}
        </div>
      </div>
    </div>
  );
};
```

---

## 新增 / 表單頁（Form Page）

```tsx
export const XxxFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => api.post('/xxx', form),
    onSuccess: (res) => { navigate(`/xxx/${res.data.id}`); },
  });

  return (
    <div className="p-6">  {/* 不加 max-w */}
      <button onClick={() => navigate('/xxx')} className="btn-ghost text-xs gap-1.5 mb-4 -ml-1">
        <ArrowLeft size={14} /> 返回列表
      </button>
      <PageHeader title="新增項目" />

      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">名稱 *</label><input className="input" value={form.name} onChange={set('name')} /></div>
        </div>
        <div>
          <label className="label">說明</label>
          <textarea className="input resize-none h-20" value={form.description} onChange={set('description')} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate('/xxx')} className="btn-secondary">取消</button>
          <button onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            className="btn-primary">
            {mutation.isPending ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 儀表板頁（Dashboard Page）

```tsx
export const DashboardPage: React.FC = () => {
  const { data: stats } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data),
  });

  return (
    <div className="p-6">  {/* 不加 max-w */}
      <PageHeader title="總覽" description="數據儀表板" />

      {/* 統計卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="項目一" value={stats?.a ?? 0}
          icon={<Icon size={20} className="text-[--color-brand]" />}
          color="bg-[--color-primary-50]" />
        {/* ... */}
      </div>

      {/* 圖表 / 列表區塊 */}
      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5">...</div>
        <div className="card p-5">...</div>
      </div>
    </div>
  );
};
```
