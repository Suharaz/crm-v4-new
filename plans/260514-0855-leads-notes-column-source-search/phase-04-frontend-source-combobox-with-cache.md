# Phase 04 - Frontend: source combobox search + cache 24h + clear on logout

## Context Links

- Plan: [plan.md](plan.md)
- Source API (no change): `apps/api/src/modules/lead-sources/lead-sources.controller.ts`
- Create lead dialog: `apps/web/src/components/leads/create-lead-dialog.tsx:127-134`
- Auth provider: `apps/web/src/providers/auth-provider.tsx:42-46`

## Overview

- **Priority:** P1 (độc lập với phase 1, có thể chạy parallel ngay)
- **Status:** Completed
- **Description:** Thay `<Select>` chọn nguồn bằng combobox có search box + lazy display (10 đầu, scroll thêm 10), cache list trong `localStorage` 24h, clear cache khi logout.

## Key Insights

- Lead sources thường <100 entries -> backend trả all 1 lần là OK, không cần pagination thật
- shadcn `<Command>` (cmdk) đã hỗ trợ search filter built-in
- localStorage có giới hạn ~5MB, list source 100 entries chỉ vài KB -> fine
- IntersectionObserver tốt hơn scroll listener (ít re-render)
- Normalize tiếng Việt khi search: bỏ dấu để gõ "thach" tìm được "Thạch"

## Requirements

### Functional

- F1: Trong popup tạo lead, field "Nguồn" là `<SourceCombobox>` thay `<Select>`
- F2: Click mở dropdown -> hiển thị search input + danh sách 10 source đầu (sort theo `name` ASC)
- F3: Gõ search -> filter client-side, không gọi API (case-insensitive, bỏ dấu)
- F4: Scroll xuống cuối list -> hiển thị 10 source tiếp theo (IntersectionObserver hoặc cmdk virtual)
- F5: Cache list trong `localStorage` key `lead-sources-cache`:
  - Format: `{ data: LeadSource[], ts: number, version: 1 }`
  - TTL: 24h (`Date.now() - ts < 86400000`)
  - Mount popup: check cache trước, nếu valid -> dùng cache, KHÔNG fetch API. Nếu invalid hoặc thiếu -> fetch API + save cache
- F6: Logout (`auth-provider.tsx:42`) -> `localStorage.removeItem('lead-sources-cache')`
- F7: Có nút nhỏ "↻" (refresh) trong combobox để force refetch (override cache) - **Optional**, scope creep nên có
- F8: Selected value hiển thị name của source khi đóng dropdown

### Non-functional

- NF1: localStorage không available (incognito strict) -> graceful fallback fetch mỗi lần (try/catch wrap)
- NF2: Search normalize tiếng Việt: dùng `str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`
- NF3: Component reusable - đặt trong `components/ui/` không phải `components/leads/`

## Architecture

### Cache helper

```ts
// apps/web/src/lib/source-cache.ts
const KEY = 'lead-sources-cache';
const TTL = 24 * 60 * 60 * 1000;

export function readSourceCache(): LeadSource[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return null;
    if (Date.now() - parsed.ts > TTL) return null;
    return parsed.data;
  } catch { return null; }
}

export function writeSourceCache(data: LeadSource[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ts: Date.now(), data }));
  } catch { /* quota / disabled - ignore */ }
}

export function clearSourceCache(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

### Hook

```ts
// apps/web/src/lib/hooks/use-lead-sources.ts
export function useLeadSources() {
  return useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => {
      const cached = readSourceCache();
      if (cached) return cached;
      const res = await api.get('/lead-sources');
      writeSourceCache(res.data);
      return res.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
```

### Combobox structure

```
<Popover>
  <PopoverTrigger>
    <Button variant="outline">{selectedSource?.name ?? 'Chọn nguồn...'}</Button>
  </PopoverTrigger>
  <PopoverContent className="p-0">
    <Command shouldFilter={false}>           // custom filter for VN normalize
      <CommandInput placeholder="Tìm nguồn..." onValueChange={setQuery} />
      <CommandList ref={listRef}>
        {visibleItems.map(s => (
          <CommandItem key={s.id} onSelect={() => onChange(s.id)}>
            {s.name}
          </CommandItem>
        ))}
        <div ref={sentinelRef} />            // IntersectionObserver target
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

### Logic

```ts
const [query, setQuery] = useState('');
const [visibleCount, setVisibleCount] = useState(10);
const { data: sources = [] } = useLeadSources();

const filtered = useMemo(() => {
  if (!query) return sources;
  const q = normalize(query);
  return sources.filter(s => normalize(s.name).includes(q));
}, [sources, query]);

const visibleItems = filtered.slice(0, visibleCount);

// reset visibleCount khi query đổi
useEffect(() => { setVisibleCount(10); }, [query]);

// IntersectionObserver tăng visibleCount
useEffect(() => {
  if (!sentinelRef.current) return;
  const obs = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) setVisibleCount(c => Math.min(c + 10, filtered.length));
  });
  obs.observe(sentinelRef.current);
  return () => obs.disconnect();
}, [filtered.length]);
```

## Related Code Files

### Read
- `apps/web/src/components/leads/create-lead-dialog.tsx:127-134` (Select hiện tại)
- `apps/web/src/components/ui/command.tsx` (shadcn cmdk)
- `apps/web/src/components/ui/popover.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/providers/auth-provider.tsx:42-46`
- `apps/web/src/lib/api-client.ts` (axios pattern)

### Modify
- `apps/web/src/components/leads/create-lead-dialog.tsx`:
  - Replace `<Select>` field sourceId bằng `<SourceCombobox value={field.value} onChange={field.onChange} />`
- `apps/web/src/providers/auth-provider.tsx:42-46`:
  - Trong logout callback, sau `setUser(null)`, gọi `clearSourceCache()`

### Create
- `apps/web/src/lib/source-cache.ts` (~40 LOC) - read/write/clear helpers
- `apps/web/src/lib/hooks/use-lead-sources.ts` (~25 LOC) - TanStack Query hook
- `apps/web/src/components/ui/source-combobox.tsx` (~120 LOC) - combobox component
- `apps/web/src/lib/normalize-vietnamese.ts` (~10 LOC) - utility (nếu chưa có sẵn ở utils package)

### Delete
- None

## Implementation Steps

1. **Read** tất cả file context
2. Kiểm tra `packages/utils` có sẵn `normalize-vietnamese` chưa. Nếu có dùng, nếu chưa tạo `apps/web/src/lib/normalize-vietnamese.ts`:
   ```ts
   export function normalizeVi(s: string): string {
     return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
   }
   ```
3. Tạo `source-cache.ts` với 3 hàm read/write/clear, try/catch tất cả localStorage access
4. Tạo `use-lead-sources.ts` hook với TanStack Query + cache check
5. Tạo `source-combobox.tsx`:
   - Props: `value: string | undefined, onChange: (id: string) => void, disabled?: boolean`
   - Internal state: query, visibleCount, open
   - Render selected name từ `sources.find(s => s.id === value)`
   - IntersectionObserver cho lazy load
6. Cập nhật `create-lead-dialog.tsx`: thay phần `<Select>` nguồn bằng `<SourceCombobox>`. Đảm bảo react-hook-form vẫn hoạt động qua `<FormField>` + `field.value`, `field.onChange`
7. Cập nhật `auth-provider.tsx`: import `clearSourceCache`, gọi sau `setUser(null)`:
   ```ts
   await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
   clearSourceCache();
   setUser(null);
   router.push('/login');
   ```
8. Chạy `pnpm build` trong `apps/web`
9. Manual test:
   - Mount popup lần đầu -> Network tab thấy 1 request `/lead-sources`. Đóng popup, mở lại -> KHÔNG request mới (cache hit)
   - Inspect localStorage -> có key `lead-sources-cache` với `ts` đúng + `data` array
   - Gõ "thach" -> filter ra "Thạch Sanh", "Bánh Thạch", ... (bỏ dấu OK)
   - Scroll list 10 đầu -> tự load 10 tiếp (kiểm tra DOM)
   - Logout -> mở DevTools Application > localStorage -> key `lead-sources-cache` bị xoá
   - Test incognito strict mode (Firefox) -> không crash, fallback fetch mỗi lần
   - Chọn nguồn -> submit form -> lead tạo đúng `sourceId`

## Todo List

- [x] Read context files
- [x] Tạo `normalize-vietnamese.ts` (hoặc reuse)
- [x] Tạo `source-cache.ts`
- [x] Tạo `use-lead-sources.ts`
- [x] Tạo `source-combobox.tsx`
- [x] Cập nhật `create-lead-dialog.tsx` thay Select bằng combobox
- [x] Cập nhật `auth-provider.tsx` clear cache khi logout
- [x] `pnpm build` không TS error
- [x] Manual test 7 case
- [x] `code-reviewer` review

## Success Criteria

- Popup tạo lead có search nguồn, lazy load 10/lần
- Cache 24h trong localStorage
- Logout clear cache
- Search bỏ dấu tiếng Việt OK
- Fallback graceful khi localStorage bị disable
- Build pass, không TS error
- UX không lag với 100+ sources

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cache stale khi admin sửa source | Medium | Optional refresh button + auto clear khi logout. Admin được khuyến nghị logout/login sau khi sửa source quan trọng. Doc trong note |
| localStorage disabled (incognito strict) | Low | try/catch, fallback fetch mỗi lần |
| IntersectionObserver không support (browser cũ) | Very Low | Modern browsers all support. Có thể fallback dùng `setVisibleCount(filtered.length)` nếu IO không có |
| cmdk built-in filter conflict với custom VN normalize | Medium | `<Command shouldFilter={false}>` disable built-in, dùng filter tự viết |
| TanStack Query refetch khi window focus override cache | Medium | `staleTime: 86400000` + `refetchOnWindowFocus: false` cho hook này |
| Selected source hiển thị undefined khi value không match data | Low | `sources.find(s => s.id === value)?.name ?? 'Chọn nguồn...'` |

## Security Considerations

- localStorage cache chứa source name + id (không nhạy cảm)
- Logout clear cache đảm bảo user A không thấy data user B nếu shared device
- Cache không lưu user-specific data, ít risk

## Skills to Activate

- `react-expert` - hooks, IntersectionObserver pattern
- `ui-styling` - shadcn Command + Popover
- `frontend-development` - TanStack Query + localStorage
- `sequential-thinking` - cache logic + edge cases

## Next Steps

- Sau khi phase 4 done -> trigger `code-reviewer` toàn bộ 4 phase
- Trigger `tester` agent (unit + e2e nếu có)
- Commit từng phase, push lên branch master sau khi all phase done + reviewed
- Update changelog + docs nếu có thay đổi public API/UI
