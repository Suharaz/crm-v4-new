# Phase 03: Pool Zoom - Cột Phân Cho + AI Distribute + Mass Recall UI

**Priority:** P0
**Status:** COMPLETE
**Effort:** ~2h
**Depends:** none (chạy song song Phase 01-02)

## Context Links

- Existing component: `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx` (449 lines)
- Existing page: `apps/web/src/app/(dashboard)/leads/pool/zoom/page.tsx`
- Reference page: `apps/web/src/app/(dashboard)/leads/pool/new/page.tsx`
- Distribution API: `apps/api/src/modules/distribution/distribution.controller.ts`
- Pool zoom service: `apps/api/src/modules/leads/leads.service.ts:256` (`poolZoom` method)
- Distribution batch filter: `apps/api/src/modules/distribution/distribution.service.ts:59` (chỉ pick `status: 'POOL'`)

## Overview

Trang `/leads/pool/zoom` cần parity với `/leads/pool/new` về 3 mặt:
1. Hiện cột "Phân cho" (assigned user) + "Tương tác" (activity count + latest note).
2. Có nút "AI Chia số" trên toolbar (batch distribute).
3. Có nút "Chia toàn bộ" để one-click chia hết leads zoom.
4. Nút "Thu hồi" mass-action nổi bật hơn (icon + color rõ).

## Key Insights (WHY)

- **Tại sao zoom hiện không có "Phân cho"?**: Component hard-code `isNewPool = poolMode === 'new'` (line 207). `poolMode='department'` được dùng cho zoom -> bị filter ra.
- **Tại sao đổi `poolMode`?**: Hiện tại zoom dùng `poolMode='department'` (designed cho `/leads/pool/department/:id`). Cần thêm option `poolMode='zoom'` để show cùng columns như new pool.
- **AI Distribute filter chỉ `status='POOL'`** (distribution.service:59). Lead zoom có `status='ZOOM'` -> AI distribute hiện tại KHÔNG pick được. Cần backend extend.
- **"Chia toàn bộ" UX**: Một click chia hết toàn table không cần select từng row - tiết kiệm 50% thao tác với 100+ leads zoom mỗi sáng.

## Requirements

### Functional
- F1: Trang `/leads/pool/zoom` đổi prop `poolMode='department'` -> `poolMode='zoom'`.
- F2: Component cho phép `poolMode: 'new' | 'floating' | 'department' | 'zoom'`. Logic `showAssignCols` = `isManager && (poolMode === 'new' || poolMode === 'zoom')`.
- F3: Auto-refresh indicator hiện cả với zoom (cùng condition).
- F4: Thêm nút "AI Chia số" trên toolbar khi `isManager && (isNewPool || isZoomPool)`. Click -> mở dialog chọn department -> POST `/distribution/distribute-zoom` (zoom) hoặc `/distribution/distribute/:deptId` (new).
- F5: Thêm nút "Chia toàn bộ" trên top-bar (không cần select) - chỉ MANAGER+, chỉ khi `leads.length > 0`. Click confirm -> POST batch distribute toàn table.
- F6: Nút "Thu hồi" trong bulk action toolbar dùng màu amber rõ (đã có), thêm icon `Undo2` + tooltip "Thu hồi về kho mới".

### Non-functional
- NF1: Không break các trang `/leads/pool/new`, `/leads/pool/floating`, `/leads/pool/department/:id`.
- NF2: Distribution chỉ MANAGER+ (controller `@Roles(SUPER_ADMIN, MANAGER)` đã có).

## Architecture

```
LeadPoolTableWithBulkAssign (modified)
  -> poolMode: 'new' | 'floating' | 'department' | 'zoom'
  -> isAssignablePool = poolMode === 'new' || poolMode === 'zoom'
  -> Show cột "Phân cho"/"Tương tác" khi isManager && isAssignablePool
  -> Toolbar buttons:
       - "Chia toàn bộ" (khi !someSelected && isAssignablePool && leads.length > 0)
       - "AI Chia số" (luôn hiện khi isAssignablePool)
       - "Phân cho 1 người" (bulk, đã có)
       - "Áp dụng Template" (bulk, đã có)
       - "Thu hồi" (bulk, đã có - chỉnh icon + color rõ hơn)

Backend distribution.service.batchDistribute(deptId, userId):
  -> Hiện tại filter status='POOL' + departmentId=deptId + assignedUserId=null
  -> Extend signature: batchDistribute(deptId, userId, { includeZoom?: boolean })
  -> Khi includeZoom=true: filter status IN ('POOL', 'ZOOM') OR thêm endpoint mới
```

## Related Code Files

### To Create
- `apps/web/src/components/leads/lead-pool-distribute-dialog.tsx` - Dialog chọn department + confirm "AI sẽ chia X leads cho dept Y". Props: `{ open, onOpenChange, leadIds?: string[] | 'all', poolMode, departments }`. Submit -> call API + revalidate.

### To Modify
- `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx`:
  - Update `PoolTableProps.poolMode` type union: add `'zoom'`
  - Replace `isNewPool` -> `isAssignablePool = poolMode === 'new' || poolMode === 'zoom'`
  - Conditionally render auto-refresh on `isAssignablePool`
  - Add "Chia toàn bộ" + "AI Chia số" buttons in top-bar (không nằm trong bulk toolbar)
  - Highlight "Thu hồi" button: thêm icon size + bold text

- `apps/web/src/app/(dashboard)/leads/pool/zoom/page.tsx`:
  - Change `poolMode="department"` -> `poolMode="zoom"`
  - Pass `departments` prop sang component (đã fetch sẵn).

- `apps/api/src/modules/distribution/distribution.service.ts`:
  - Update `batchDistribute(deptId, userId, opts?: { includeZoom?: boolean })` - filter `status IN ('POOL', 'ZOOM')` khi `includeZoom=true`.

- `apps/api/src/modules/distribution/distribution.controller.ts`:
  - Add `POST /distribution/distribute-zoom/:deptId` shortcut endpoint hoặc add query param `?includeZoom=true` cho endpoint hiện tại.

### To Delete
- None.

## Implementation Steps

### Frontend

1. **Modify `lead-pool-table-with-bulk-assign.tsx`**:
   - Line 51-55: Update `PoolTableProps.poolMode` union: `'new' | 'floating' | 'department' | 'zoom'`.
   - Line 207: Replace `const isNewPool = poolMode === 'new'` with:
     ```ts
     const isAssignablePool = poolMode === 'new' || poolMode === 'zoom';
     ```
   - Line 243, 258: Replace `isNewPool` -> `isAssignablePool`.
   - Above bulk toolbar (around line 211), add top-bar:
     ```tsx
     {isManager && isAssignablePool && leads.length > 0 && !someSelected && (
       <div className="mb-3 flex items-center justify-end gap-2">
         <Button size="sm" variant="outline" onClick={() => openDistributeDialog('selection')}>
           <Sparkles className="h-4 w-4 mr-1" />AI Chia số
         </Button>
         <Button size="sm" onClick={() => openDistributeDialog('all')}>
           <Shuffle className="h-4 w-4 mr-1" />Chia toàn bộ ({leads.length})
         </Button>
       </div>
     )}
     ```
   - Add prop `departments: { id: string; name: string }[]` to component.
   - Add state `distributeDialogOpen` + `distributeScope: 'selection' | 'all'`.
   - Mount `<LeadPoolDistributeDialog>` cuối component.

2. **Create `lead-pool-distribute-dialog.tsx`**:
   - Dialog with department select + lead count display.
   - Submit logic:
     - `scope === 'selection'`: POST `/leads/bulk-assign` với danh sách selected + chọn template/AI distribute config.
     - `scope === 'all'` && `poolMode === 'zoom'`: POST `/distribution/distribute-zoom/:deptId`.
     - `scope === 'all'` && `poolMode === 'new'`: POST `/distribution/distribute/:deptId`.
   - Show progress toast + refresh table after success.

3. **Modify `pool/zoom/page.tsx`** (line 57):
   - Change `poolMode="department"` -> `poolMode="zoom"`.
   - Pass `departments={departments}` prop.

4. **Modify bulk-action toolbar** (line 229-235):
   - Hiện đã có "Thu hồi" với màu amber. Highlight thêm:
     - Tăng icon size: `h-4 w-4` -> `h-4 w-4` (giữ nguyên, nhưng dùng `font-medium`).
     - Tooltip: `title="Thu hồi lead về kho mới (POOL, không phân ai)"`.
     - Hoặc giữ nguyên - đã rõ ràng (decision tùy review).

### Backend

5. **Modify `distribution.service.ts:55-65`** (assumed area):
   - Add param `opts?: { includeZoom?: boolean }`.
   - Update filter:
     ```ts
     const statuses = opts?.includeZoom ? ['POOL', 'ZOOM'] as const : ['POOL'] as const;
     where: { status: { in: [...statuses] }, departmentId, assignedUserId: null, deletedAt: null }
     ```

6. **Modify `distribution.controller.ts`**:
   - Add endpoint:
     ```ts
     @Post('distribute-zoom/:deptId')
     @HttpCode(200)
     async batchDistributeZoom(
       @Param('deptId', ParseBigIntPipe) deptId: bigint,
       @CurrentUser() user: any,
     ) {
       return { data: await this.service.batchDistribute(deptId, user.id, { includeZoom: true }) };
     }
     ```

### Test

7. **Manual test**:
   - Login MANAGER -> trang `/leads/pool/zoom`:
     - Verify cột "Phân cho" + "Tương tác" hiện.
     - Verify nút "AI Chia số" + "Chia toàn bộ" hiện trên top-bar.
   - Click "Chia toàn bộ" -> chọn dept -> verify toast "Đã chia X leads cho dept Y" + table refresh.
   - Verify lead status đổi từ ZOOM -> ASSIGNED + có `assignedUserId`.
   - Select 5 leads -> click "Thu hồi" -> verify amber button hiện + thu hồi thành công.
   - Login USER -> verify không thấy nút "AI Chia số" / "Chia toàn bộ" (vì isManager false).

## Todo List

- [x] Backend: Add `includeZoom` opt vào `batchDistribute`
- [x] Backend: Add endpoint `POST /distribution/distribute-zoom/:deptId`
- [x] Frontend: Update `PoolTableProps.poolMode` type union + replace `isNewPool` -> `isAssignablePool`
- [x] Frontend: Add top-bar "AI Chia số" + "Chia toàn bộ" buttons
- [x] Frontend: Add `departments` prop + mount distribute dialog
- [x] Frontend: Create `lead-pool-distribute-dialog.tsx`
- [x] Frontend: Modify `pool/zoom/page.tsx` -> `poolMode="zoom"` + pass departments
- [x] Frontend: Tweak "Thu hồi" button tooltip (optional polish)
- [x] Manual test 4 scenarios
- [x] `pnpm typecheck` + `pnpm test` pass

## Success Criteria

- [x] `/leads/pool/zoom` hiện cột "Phân cho" + "Tương tác" giống `pool/new`
- [x] Có nút "AI Chia số" + "Chia toàn bộ" trên top-bar zoom (chỉ MANAGER+)
- [x] Click "Chia toàn bộ" + chọn dept -> chia hết leads ZOOM cho dept đó
- [x] Nút "Thu hồi" rõ ràng trong bulk toolbar
- [x] Trang `/leads/pool/new` không bị regression (vẫn dùng `poolMode='new'`)
- [x] Trang `/leads/pool/floating` + `/leads/pool/department/:id` không bị regression

## Risk Assessment

- **Risk:** AI distribute config chỉ dùng cho department có config record. Dept chưa setup config -> rollback hoặc default config?
  - **Mitigation:** Check `getConfig(deptId)` trong `batchDistribute`, throw rõ ràng nếu không có. Frontend hiển thị warning trong dialog: "Dept Y chưa cấu hình AI - vui lòng setup config trước".

- **Risk:** "Chia toàn bộ" trên 1000+ leads zoom có thể timeout request.
  - **Mitigation:** Add `take: 200` limit trong service, return `{ assigned: N, remaining: M }`. UI: nếu remaining > 0, hiện hint "Còn M lead, click lại để chia tiếp".

- **Risk:** Đổi `poolMode='department' -> 'zoom'` có thể ảnh hưởng filter storageKey, hoặc các quick filter scope.
  - **Mitigation:** `pool/zoom/page.tsx` đã có `storageKey="crm_lead_filters_pool_zoom"` + `scope="pool-zoom"` riêng - không đụng. Chỉ thay đổi prop component.

## Security Considerations

- "AI Chia số" + "Chia toàn bộ" endpoint đã có `@Roles(MANAGER, SUPER_ADMIN)` controller-level.
- UI chỉ hide button cho USER - backend là source of truth.
- Verify `deptId` user chọn match với scope dept của họ (SUPER_ADMIN bất kỳ dept, MANAGER chỉ dept của mình - check existing logic trong `batchDistribute`).

## Unresolved Questions

1. AI Distribute config: dept zoom chưa config có default fallback (round-robin) hay throw error?
2. "Chia toàn bộ" với 500+ leads: batch 1 lần hay chunked? Limit hiện tại của `batchDistribute`?
3. Lead zoom có department được pre-assign từ source (skipPool) không, hay thực sự null? Nếu null -> cần user chọn department trong dialog. Nếu có sẵn -> auto-pick.

## Next Steps

- Sau khi 3 phase xong, run full E2E test suite trên lead pool flows.
- Update `docs/codebase-summary.md` ghi rõ pattern `poolMode` mới.
- Commit theo conventional: `feat(leads): add edit drawer + secondary phones + zoom AI distribute`.
