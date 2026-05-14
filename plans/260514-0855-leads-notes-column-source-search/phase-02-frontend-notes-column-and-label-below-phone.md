# Phase 02 - Frontend: cột Note + nhãn pill nhỏ dưới SĐT

## Context Links

- Plan: [plan.md](plan.md)
- Phase 1: [phase-01](phase-01-backend-notes-and-create-with-note.md) - blocker
- Lead table: `apps/web/src/components/leads/lead-table.tsx:90-99`
- Phone cell: `apps/web/src/components/leads/phone-cell.tsx`
- Lead duplicate badge: `apps/web/src/components/leads/lead-duplicate-badge.tsx`

## Overview

- **Priority:** P1
- **Status:** Completed
- **Description:** Đổi cấu trúc cột bảng `/leads` để có cột Note hiển thị note mới nhất + badge `+N` (popover xem 5), bỏ cột Nhãn KH ra khỏi bảng, gắn nhãn pill nhỏ ngay dưới SĐT trong `PhoneCell`.

## Key Insights

- API đã trả `recentNotes` sau phase 1 -> không phải fetch riêng
- shadcn `<Popover>` có sẵn -> dùng lazy render content
- Tailwind `line-clamp-1` truncate gọn hơn JS slice
- Nhãn vẫn là single (`lead.labelId` FK) -> không phải array
- Nhãn pill cần đủ contrast với nền trắng row + hover row -> dùng `style={{ backgroundColor: label.color, color: label.textColor }}` như hiện tại, nhỏ size lại

## Requirements

### Functional

- F1: Bảng /leads bỏ cột "Nhãn KH" (header + cell)
- F2: Thêm cột mới "Note" sau cột "Nguồn khách" (hoặc vị trí phù hợp về UX)
- F3: Cell Note hiển thị:
  - Nếu `recentNotes.length === 0`: text mờ "-" hoặc "Chưa có note"
  - Nếu `recentNotes.length >= 1`: text note[0].content truncate 1 dòng + (nếu > 1) badge `+(length-1)` màu xám nhỏ
- F4: Click cell Note (hoặc hover badge) mở Popover hiển thị tất cả 5 note (CHỈ content, không tên/timestamp), mỗi note 1 card có `border-b`, content `whitespace-pre-wrap`
- F5: Nhãn pill nhỏ (`text-xs px-1.5 py-0.5 rounded`) hiển thị ngay dưới SĐT trong `PhoneCell`, dùng `label.color` làm background, `label.textColor` làm text color
- F6: Nếu lead không có nhãn (`labelId == null`) -> không render gì dưới SĐT

### Non-functional

- NF1: Popover content lazy render (render khi mở)
- NF2: Không vượt mobile breakpoint - giữ responsive (cell Note ẩn ở mobile hoặc gộp vào dropdown info nếu cần)
- NF3: Không em dash trong code mới

## Architecture

### Component tree (new)

```
LeadTable
├── PhoneCell (modified)
│   ├── PhoneLink + DuplicateBadge
│   └── LabelPill (NEW, conditional)        <- nhãn nhỏ
└── LeadNotesCell (NEW)
    ├── Note 0 content (truncate)
    ├── Badge "+N" (conditional)
    └── Popover (lazy)
        └── Stack 5 notes (chỉ content)
```

### Data shape (post-phase-1)

```ts
type LeadListItem = {
  // ...existing fields
  label: { id: string; name: string; color: string; textColor: string } | null;
  recentNotes: Array<{ id: string; content: string; createdAt: string }>;
};
```

## Related Code Files

### Read (for context)
- `apps/web/src/components/leads/lead-table.tsx` (toàn file để hiểu structure column)
- `apps/web/src/components/leads/phone-cell.tsx`
- `apps/web/src/components/leads/lead-duplicate-badge.tsx`
- `apps/web/src/components/ui/popover.tsx` (shadcn)
- `apps/web/src/components/ui/badge.tsx` (nếu có)
- `apps/web/src/types/lead.ts` hoặc `packages/types/src/lead.ts`

### Modify
- `apps/web/src/components/leads/lead-table.tsx`:
  - Bỏ column "Nhãn KH" (`<th>` + `<td>` chứa pill `lead.label`)
  - Thêm column "Note" với cell `<LeadNotesCell notes={lead.recentNotes} />`
- `apps/web/src/components/leads/phone-cell.tsx`:
  - Thêm prop `label?: { name, color, textColor } | null`
  - Render `<LabelPill>` dưới SĐT nếu label != null
- `apps/web/src/types/lead.ts`: thêm `recentNotes` type

### Create
- `apps/web/src/components/leads/lead-notes-cell.tsx` (~80 LOC):
  - Props: `notes: LeadNoteSummary[]`
  - Render: note đầu truncate + badge + popover
- `apps/web/src/components/leads/label-pill.tsx` (~30 LOC):
  - Props: `label: { name, color, textColor }, size?: 'sm' | 'xs'`
  - Reusable pill nhỏ (cũng dùng được chỗ khác sau)

### Delete
- None (chỉ xoá đoạn code render label trong lead-table.tsx, không xoá file)

## Implementation Steps

1. **Read** tất cả file trong "Read" section
2. Tạo `label-pill.tsx`:
   ```tsx
   export function LabelPill({ label, size = 'xs' }: Props) {
     return (
       <span
         className="inline-block rounded text-xs px-1.5 py-0.5 max-w-[120px] truncate"
         style={{ backgroundColor: label.color, color: label.textColor }}
         title={label.name}
       >
         {label.name}
       </span>
     );
   }
   ```
3. Cập nhật `phone-cell.tsx`:
   - Thêm prop `label`
   - Sau `<PhoneLink>` + `<DuplicateBadge>`, thêm `<div className="mt-0.5">{label && <LabelPill label={label} />}</div>`
4. Tạo `lead-notes-cell.tsx`:
   ```tsx
   export function LeadNotesCell({ notes }: { notes: LeadNoteSummary[] }) {
     if (!notes?.length) return <span className="text-gray-400 text-sm">-</span>;
     const first = notes[0];
     const extra = notes.length - 1;
     return (
       <Popover>
         <PopoverTrigger asChild>
           <button className="text-left w-full max-w-[240px]">
             <span className="line-clamp-1 text-sm">{first.content}</span>
             {extra > 0 && (
               <span className="ml-1 inline-block rounded-full bg-gray-100 text-gray-600 text-[10px] px-1.5">
                 +{extra}
               </span>
             )}
           </button>
         </PopoverTrigger>
         <PopoverContent className="w-80 max-h-96 overflow-y-auto p-0">
           {notes.map((n, i) => (
             <div key={n.id} className={`px-3 py-2 ${i < notes.length - 1 ? 'border-b' : ''}`}>
               <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
             </div>
           ))}
         </PopoverContent>
       </Popover>
     );
   }
   ```
5. Cập nhật `lead-table.tsx`:
   - Header: bỏ `<th>Nhãn KH</th>`, thêm `<th>Note</th>` (vị trí phù hợp)
   - Row: bỏ `<td>` render label pill, thêm `<td><LeadNotesCell notes={lead.recentNotes} /></td>`
   - Truyền `label={lead.label}` vào `<PhoneCell>` (existing đang nhận `phone` + `leadId`)
6. Cập nhật `types/lead.ts` (nếu tách riêng frontend): thêm `recentNotes: LeadNoteSummary[]`
7. Chạy `pnpm build` trong `apps/web` -> không TS error
8. Manual test:
   - Lead không nhãn + không note -> SĐT không pill, cell Note hiện "-"
   - Lead có nhãn + 1 note -> pill dưới SĐT, cell Note hiện content note, không badge
   - Lead có nhãn + 5 note -> pill dưới SĐT, cell Note hiện note mới nhất + badge "+4", click mở popover thấy 5 note
   - Lead có 7 note (chỉ 5 trả từ API) -> badge "+4"
   - Mobile view không vỡ layout

## Todo List

- [x] Read context files
- [x] Tạo `label-pill.tsx`
- [x] Tạo `lead-notes-cell.tsx`
- [x] Cập nhật `phone-cell.tsx` thêm prop label + render pill
- [x] Cập nhật `lead-table.tsx` bỏ cột Nhãn + thêm cột Note + truyền label vào PhoneCell
- [x] Cập nhật type `LeadListItem` thêm `recentNotes`
- [x] `pnpm build` không TS error
- [x] Manual test 5 case
- [x] `code-reviewer` review

## Success Criteria

- Bảng /leads hiển thị cột Note thay cột Nhãn KH
- Nhãn pill nhỏ dưới SĐT khi có
- Popover note chỉ hiển thị content, lazy render
- Lead không note hiển thị placeholder "-"
- Không vỡ responsive (mobile + tablet)
- Tests UI hiện có không break (nếu có)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bảng vượt width khi note dài | Medium | `line-clamp-1` + `max-w-[240px]` |
| Popover bị clip trong table cell | Medium | shadcn popover dùng portal, không bị clip |
| Badge "+N" với N=0 không hiện -> code logic bug | Low | Đã check `extra > 0` trước render |
| Color contrast pill nhãn không đủ | Low | Dùng `label.textColor` từ DB (admin đã set), không tự generate |
| Lead `label` undefined vs null khác nhau | Low | Dùng `label && <LabelPill .../>` truthy check |

## Security Considerations

- Note content render qua React text node (`{n.content}`) -> tự động escape, không XSS
- Không dùng `dangerouslySetInnerHTML`
- Pill style dùng inline style với color từ DB -> CSS injection không thể (CSS-only)

## Skills to Activate

- `react-expert` - component composition, popover pattern
- `ui-styling` - Tailwind line-clamp, responsive
- `frontend-development` - shadcn/ui patterns

## Next Steps

- Phase 2 hoàn thành -> tiếp phase 3 (popup note field), phase 4 (source combobox)
- Commit + push từng phase riêng
