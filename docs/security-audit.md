# Security Audit Log — VeloCRM

Ghi lại các vấn đề bảo mật đã phát hiện, trạng thái xử lý, và các quyết định thiết kế liên quan đến bảo mật.

---

## Audit 2026-04-29 — Review commits `a738757`→`de4bd60`

**Phạm vi:** `system-settings.*`, `import.*`, `csv-detect.ts`, `bank-transaction-import.*`, `ai-prompt-settings.tsx`

---

### 🔴 HIGH — PUT `/system-settings/:key` echoes raw secret trong response

**Status:** ✅ Đã fix (2026-04-29)  
**File:** `apps/api/src/modules/system-settings/system-settings.controller.ts:21`

**Mô tả:**  
Commit `de4bd60` đã fix GET `/system-settings` — mask `ai_api_key` qua `getAll()`. Tuy nhiên PUT endpoint vẫn trả raw value trong response body.

**Đã fix:** Đổi `maskIfSecret` từ `private` → `public`, controller PUT response gọi `this.service.maskIfSecret(key, body.value)`.

---

### 🟡 MEDIUM — Frontend placeholder lộ 4 ký tự cuối của API key

**Status:** ✅ Đã fix (2026-04-29)  
**File:** `apps/web/src/components/settings/ai-prompt-settings.tsx:117`

**Mô tả:**  
`initialApiKey` chứa `••••xxxx` — 4 ký tự suffix xuất hiện trong placeholder input, visible trong HTML source, screenshot, screen share.

**Đã fix:** Placeholder đổi thành `'Key đã được thiết lập — để trống nếu không đổi'` — không còn chứa masked value.

---

### 🟡 MEDIUM — `req.body.value` redaction quá broad (global)

**Status:** ✅ Đã fix (2026-04-29)  
**File:** `apps/api/src/app.module.ts:84`

**Mô tả:**  
Redact `req.body.value` áp dụng toàn bộ app — bất kỳ endpoint nào nhận field `value` đều mất data trong logs.

**Đã fix:** Bỏ `req.body.value` khỏi global redact, thay bằng custom `serializers.req()` chỉ redact khi URL chứa `/system-settings` + method PUT.

---

### 🟠 LOW — `import.controller.ts` không kiểm tra MIME type (inconsistency)

**Status:** ✅ Đã fix (2026-04-29)  
**File:** `apps/api/src/modules/import/import.controller.ts`

**Mô tả:**  
Leads/customers import chỉ kiểm tra extension `.csv`. Bank-transaction import kiểm tra cả MIME + extension.

**Đã fix:** Tách `CSV_UPLOAD_OPTIONS` constant chung cho cả 2 endpoint (DRY). Check cả MIME (`text/csv`, `text/plain`, `application/vnd.ms-excel`, `application/octet-stream`) + extension `.csv`.

---

## Những vấn đề đã được xử lý tốt

| Commit | Nội dung |
|--------|---------|
| `de4bd60` | Mask secret values trong GET `/system-settings` — `maskIfSecret()` pattern tự động cover key mới theo suffix |
| `de4bd60` | Redact `req.body.value` khỏi Pino request log |
| `de4bd60` | Frontend: disable Save button khi input trống (tránh overwrite key bằng masked string) |
| Import service | Path traversal check trong `getErrorFilePath()` — `path.resolve` + `startsWith(baseDir + sep)` |
| `csv-detect.ts` | BOM stripping sau decode UTF-8/UTF-16 |
| Import controller | `@Roles(MANAGER, SUPER_ADMIN)` trên class-level |
| Bank webhook | `@Public()` + `@ApiKeyAuth()` + `@UseGuards(WebhookSignatureGuard)` |
| Upload endpoints | File size limit 10MB nhất quán |
| Import service | Ownership check trong `getStatus()` trước khi serve error file |

---

## Ưu tiên xử lý

| # | Severity | File | Status |
|---|---------|------|--------|
| 1 | 🔴 HIGH | `system-settings.controller.ts` | ✅ Đã fix — PUT response masked |
| 2 | 🟡 MEDIUM | `ai-prompt-settings.tsx` | ✅ Đã fix — placeholder không lộ suffix |
| 3 | 🟡 MEDIUM | `app.module.ts` | ✅ Đã fix — scoped serializer thay global redact |
| 4 | 🟠 LOW | `import.controller.ts` | ✅ Đã fix — MIME + ext check, DRY constant |
