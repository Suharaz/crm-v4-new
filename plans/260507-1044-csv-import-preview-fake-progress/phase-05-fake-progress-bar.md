# Phase 05 - Fake Progress Bar Hook + Component

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: Section 5.6
- Dependencies: Phase 04 (cần status PROCESSING từ flow)
- Blocks: Phase 06 (test full flow)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 1h
- **Status:** completed
- **Description:** Tạo `useFakeProgress` hook (linear 0-99% trong 2 phút, ease-out lên 100% khi xong) + `ImportProgressBar` component dùng trong UploadZone/JobStatusRow khi job PROCESSING.

## Key Insights

- Pure client-side, không cần API mới, không tốn server
- Linear công thức đơn giản: `progress = min(99, (elapsed / 120000) * 99)`
- Khi job xong: snap không tốt UX -> ease-out cubic 1.5s từ progress hiện tại lên 100%
- Khi job FAILED: bar không snap 100% mà reset, parent component xử lý hiện trạng thái lỗi
- Hook nhận 2 param: `isRunning` (bắt đầu fake) + `isDone` (trigger ease-out lên 100%)
- Hook trả số 0-100 để render width %

## Requirements

### Functional
- `useFakeProgress(isRunning: boolean, isDone: boolean): number`
- Khi `isRunning` chuyển true: start timer, tăng 0 -> 99 trong 2 phút (linear)
- Khi `isRunning` true mà sau 2 phút chưa `isDone`: bar dừng 99
- Khi `isDone` chuyển true: ease-out cubic từ progress hiện tại -> 100 trong 1.5s
- Khi `isRunning` chuyển false (không phải vì done): reset về 0
- Cleanup: clear interval/animationFrame khi unmount

### Non-functional
- Smooth animation, dùng `requestAnimationFrame` cho ease-out (60fps)
- Update interval cho linear: 100ms (10fps đủ mượt cho linear bar)
- Không leak memory

## Architecture

```
use-fake-progress.ts (hook)
  state: progress (number 0-100)
  refs: startTimeRef, intervalRef, rafRef

  useEffect [isRunning, isDone]:
    if (!isRunning) -> reset progress=0, clear timers
    if (isDone) -> trigger ease-out RAF loop từ current progress -> 100
    else if (isRunning) -> start interval mỗi 100ms tính linear

  cleanup: clearInterval + cancelAnimationFrame

import-progress-bar.tsx (component)
  props: { progress: number, label?: string, error?: boolean }
  Render Tailwind:
    Container relative h-2 rounded-full bg-slate-200 overflow-hidden
    Inner div absolute h-full rounded-full transition-all duration-100
      bg gradient sky-400 -> cyan-400 (success)
      bg red-500 (error)
      width: `${progress}%`
  Optional label trên bar: "X% - Đang import..."
```

## Related Code Files

### Read
- `apps/web/src/components/import/csv-import-upload-with-job-status.tsx` (existing - để tích hợp progress bar vào đâu)
- `apps/web/tailwind.config.ts` (verify sky/cyan colors enabled)

### Modify
- `apps/web/src/components/import/csv-import-upload-with-job-status.tsx` (mount ImportProgressBar khi status PROCESSING)

### Create
- `apps/web/src/hooks/use-fake-progress.ts`
- `apps/web/src/components/import/import-progress-bar.tsx`

### Delete
- (none)

## Implementation Steps

1. **Tạo `use-fake-progress.ts`**
   ```typescript
   import { useState, useEffect, useRef } from 'react';

   const FAKE_DURATION_MS = 120_000;  // 2 phút linear 0-99
   const SMOOTH_FINISH_MS = 1_500;     // 1.5s ease-out lên 100

   export function useFakeProgress(isRunning: boolean, isDone: boolean): number {
     const [progress, setProgress] = useState(0);
     const startTimeRef = useRef<number | null>(null);
     const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
     const rafRef = useRef<number | null>(null);

     useEffect(() => {
       // Reset
       if (!isRunning && !isDone) {
         setProgress(0);
         startTimeRef.current = null;
         if (intervalRef.current) clearInterval(intervalRef.current);
         if (rafRef.current) cancelAnimationFrame(rafRef.current);
         return;
       }

       // Done: ease-out lên 100
       if (isDone) {
         if (intervalRef.current) clearInterval(intervalRef.current);
         const startProgress = progress;
         const startTime = Date.now();
         const animate = () => {
           const elapsed = Date.now() - startTime;
           const t = Math.min(1, elapsed / SMOOTH_FINISH_MS);
           const eased = 1 - Math.pow(1 - t, 3);  // ease-out cubic
           setProgress(startProgress + (100 - startProgress) * eased);
           if (t < 1) rafRef.current = requestAnimationFrame(animate);
         };
         rafRef.current = requestAnimationFrame(animate);
         return () => {
           if (rafRef.current) cancelAnimationFrame(rafRef.current);
         };
       }

       // Running: linear 0-99 / 2 phút
       startTimeRef.current = Date.now();
       intervalRef.current = setInterval(() => {
         const elapsed = Date.now() - (startTimeRef.current ?? 0);
         const pct = Math.min(99, (elapsed / FAKE_DURATION_MS) * 99);
         setProgress(pct);
       }, 100);

       return () => {
         if (intervalRef.current) clearInterval(intervalRef.current);
       };
     }, [isRunning, isDone]);  // không depend progress để tránh re-trigger

     return progress;
   }
   ```

2. **Tạo `import-progress-bar.tsx`**
   ```tsx
   interface Props {
     progress: number;
     label?: string;
     error?: boolean;
   }

   export function ImportProgressBar({ progress, label, error }: Props) {
     const pct = Math.round(progress);
     return (
       <div className="space-y-1.5">
         {label && (
           <div className="flex justify-between text-xs text-slate-600">
             <span>{label}</span>
             <span className="font-medium">{pct}%</span>
           </div>
         )}
         <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
           <div
             className={`absolute h-full rounded-full transition-[width] duration-100 ease-linear ${
               error ? 'bg-red-500' : 'bg-gradient-to-r from-sky-400 to-cyan-400'
             }`}
             style={{ width: `${pct}%` }}
           />
         </div>
       </div>
     );
   }
   ```

3. **Tích hợp vào `JobStatusRow`** (hoặc render row mới)
   - Khi `job.status === 'PROCESSING'`: `useFakeProgress(true, false)` -> render bar
   - Khi status chuyển COMPLETED -> `useFakeProgress(true, true)` -> ease-out lên 100
   - Khi FAILED -> render bar `error={true}` + reset progress (parent quyết định reset hoặc giữ)
   - Lưu ý: `useFakeProgress` chỉ start khi user bấm Import (status -> PROCESSING), KHÔNG dùng cho status PENDING_REVIEW (đó là dry-run server-side, dùng spinner)

4. **Edge case handling**
   - Status PENDING_REVIEW: hiện spinner "Đang kiểm tra..." (không dùng progress bar)
   - Status PROCESSING vừa mount mà job đã chạy lâu (vd refresh trang giữa flow): `useFakeProgress` start từ thời điểm mount -> progress sẽ chạy lại từ 0. Acceptable cho MVP, document trong code comment.
     Optional cải tiến: tính `elapsed = now - job.startedAt` và bypass nếu > 2 phút (bắt đầu thẳng 99). Defer trừ khi user phàn nàn.

5. **Smoke test browser**
   - Upload + Import file nhỏ (~30 row, xong < 5s) -> bar đang ở vài % -> ease-out lên 100% mượt
   - Upload file lớn (5000 row) -> bar tăng smooth tới 99% -> dừng -> khi xong ease-out 100%
   - Force FAIL trong worker -> bar chuyển đỏ + reset

## Todo List

- [ ] Tạo `use-fake-progress.ts` hook
- [ ] Tạo `import-progress-bar.tsx` component
- [ ] Tích hợp vào `JobStatusRow` (render khi PROCESSING)
- [ ] Edge case PENDING_REVIEW dùng spinner, không dùng progress bar
- [ ] Smoke test xong sớm -> ease-out 100% mượt
- [ ] Smoke test xong > 2 phút -> bar dừng 99% chờ
- [ ] Smoke test FAILED -> bar đỏ
- [ ] Cleanup verify (không leak interval/RAF khi unmount)

## Success Criteria

- [ ] Hook trả number 0-100 đúng theo state
- [ ] Linear tăng đều trong 2 phút (kiểm bằng eyeball)
- [ ] Ease-out lên 100% mượt (không giật)
- [ ] Bar dừng 99% khi job > 2 phút chưa xong
- [ ] Bar đỏ khi error
- [ ] Cleanup interval/RAF khi unmount (devtools không thấy leak)
- [ ] Tailwind colors render đúng (sky-400 -> cyan-400 gradient)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Hook re-trigger khi parent re-render | MED | Dependency array chỉ [isRunning, isDone], không depend progress |
| Memory leak interval/RAF | MED | Cleanup trong useEffect return |
| Bar nhảy giật khi setProgress quá nhanh | LOW | `transition: width 100ms ease-linear` smooth bridge giữa update |
| Refresh giữa PROCESSING -> bar reset 0 | LOW | Acceptable cho MVP, document |
| FAILED state -> bar đứng ở 95% rồi nhảy đỏ -> confusing | MED | Parent component reset progress = 0 khi status -> FAILED, render bar đỏ ngắn rồi unmount |

## Security Considerations

- Pure client-side, không có security concern
- Không expose data nhạy cảm

## Next Steps

- Phase 06: e2e test full flow + manual QA edge cases
