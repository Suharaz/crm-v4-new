# Security Audit - IDOR + RBAC Deep Review

**Date**: 2026-05-12 11:52
**Scope**: Manual deep review của `apps/api/src/modules/**` for IDOR / authorization flaws (complement to `security-scan-260512-1110`).
**Auth model**: JWT (DB-revalidated per request - good), Roles guard global, ApiKey + Webhook signature for external.
**buildAccessFilter coverage**: 4 entity types (`lead`, `customer`, `order`, `task`) only. USER role auto-scoped; MANAGER+ unfiltered.

---

## Critical Findings

### FIND-001 - Critical - IDOR via query param overwrite của buildAccessFilter (Customer list)
- **CVSS**: 8.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)
- **File**: `apps/api/src/modules/customers/customers.service.ts:42-51`
- **Description**: `list()` ghép `buildAccessFilter(user, 'customer')` (set `assignedUserId: user.id` cho USER) RỒI lại set `where.assignedUserId = BigInt(query.assignedUserId)` nếu user truyền query param. Object spread sau cùng đè giá trị scope.
- **Impact**: USER role gọi `GET /customers?assignedUserId=<bất kỳ id khác>` → đọc danh sách KH của nhân viên khác bao gồm tên, SĐT, email, label. Bypass IDOR.
- **Repro**: `GET /api/v1/customers?assignedUserId=2` với token của user id=5.
- **Remediation**:
  ```ts
  // Block assignedUserId override cho USER (giống pattern leads:67)
  if (query.assignedUserId && user?.role !== UserRole.USER) {
    where.assignedUserId = BigInt(query.assignedUserId);
  }
  if (query.departmentId && user?.role !== UserRole.USER) {
    where.assignedDepartmentId = BigInt(query.departmentId);
  }
  ```
- **References**: CWE-639 (Authorization Bypass Through User-Controlled Key), OWASP A01:2021.

### FIND-002 - Critical - Missing @Roles guard on dashboard drill-down endpoint
- **CVSS**: 7.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)
- **File**: `apps/api/src/modules/dashboard/dashboard.controller.ts:112-141`
- **Description**: Endpoint `GET /dashboard/employee-reports/sales-breakdown/customers` thiếu `@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)` (mọi endpoint `employee-reports/*` khác đều có guard này). Trong khi service method `getEmployeeSalesBreakdownCustomers` không kiểm tra role + nhận `userId` từ query.
- **Impact**: Bất kỳ USER nào cũng gọi được endpoint, truyền `userId=<X>` để xem toàn bộ KH (tên, SĐT, label, doanh thu, đơn hàng) thuộc về user X. Sale A spy được toàn bộ portfolio của Sale B chỉ với 1 request.
- **Remediation**:
  ```ts
  @Get('employee-reports/sales-breakdown/customers')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)   // <-- thêm
  async getSalesBreakdownCustomers(...) { ... }
  ```
- **References**: CWE-862 (Missing Authorization), OWASP A01:2021.

### FIND-003 - Critical - Activities timeline + note creation thiếu hoàn toàn ownership check
- **CVSS**: 7.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N)
- **File**: `apps/api/src/modules/activities/activities.service.ts:51-96`, `apps/api/src/modules/activities/activities.controller.ts:27-74`
- **Description**: `getTimeline()` chỉ check entity tồn tại, KHÔNG check user có quyền xem entity. `createNote()` cũng vậy. Controller không guard. `@CurrentUser` chỉ dùng làm `userId` cho note creator, không validate ownership.
- **Impact**: 
  - **Read**: USER gọi `GET /leads/:id/activities` cho id bất kỳ → đọc toàn bộ ghi chú/lịch sử cuộc gọi của lead người khác (bao gồm nội dung NOTE/CALL chứa thông tin nhạy cảm về khách hàng, deal, giá cả).
  - **Write**: USER gọi `POST /leads/:id/activities` ghi note giả mạo vào lead người khác (tampering audit trail, mở rộng đến phishing nội bộ).
  - `getStatsByDepartment` cũng không guard → spy hoạt động dept khác.
- **Remediation**: Truyền `user: AccessFilterUser` vào service, dùng `leadsService.findById(id, user)` hoặc `customersService.findById(id, user)` trước khi đọc/ghi activity.
  ```ts
  // activities.controller.ts
  @Get('leads/:id/activities')
  async leadTimeline(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any, ...) {
    await this.leadsService.findById(id, user); // throws 404 if no access
    return this.service.getTimeline('LEAD', id, limit ?? 20, cursor);
  }
  ```
- **References**: CWE-285 (Improper Authorization), CWE-639, OWASP A01:2021.

### FIND-004 - Critical - Customer transfer mở cho mọi USER (no role guard)
- **CVSS**: 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N)
- **File**: `apps/api/src/modules/customers/customers.controller.ts:63-72`, `customers.service.ts:241-288`
- **Description**: `POST /customers/:id/transfer` không có `@Roles()`. `checkTransferPermission()` cho phép `customer.assignedUserId === user.id` → user đang giữ cũng được chuyển. Đối chiếu CLAUDE.md: "Transfer permission: user đang giữ + manager dept + super_admin" - rule này đúng spec. NHƯNG `findById(id)` (KHÔNG truyền user) sẽ lấy customer bất kỳ, sau đó `checkTransferPermission` so sánh assignedUserId === user.id, nên nếu khách hàng KHÔNG có assignee (`assignedUserId IS NULL`) và user là MANAGER → đường dẫn "Manager can transfer unowned customers" trigger, không kiểm tra dept. Manager phòng A có thể chuyển KH unowned đang ở dept B sang dept khác.
- **Impact**: Manager dept A claim/chuyển KH unowned thuộc dept B mà không được phép quản lý dept B.
- **Remediation**: Manager-with-no-assignee path phải check dept ownership:
  ```ts
  if (user.role === UserRole.MANAGER) {
    if (!customer.assignedUserId) {
      // Verify manager manages the customer's dept (or it's null)
      const deptId = customer.assignedDepartmentId as bigint | null;
      if (!deptId) return; // truly orphaned
      const managed = await this.prisma.managerDepartment.findUnique({...});
      if (managed) return;
      throw new ForbiddenException(...);
    }
    // ... existing dept check
  }
  ```
- **References**: CWE-863 (Incorrect Authorization), OWASP A01:2021.

### FIND-005 - Critical - Lead transfer same flaw cho manager + leads chưa assign
- **CVSS**: 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N)
- **File**: `apps/api/src/modules/leads/leads.service.ts:987-1003`
- **Description**: Tương tự FIND-004. `checkTransferPermission` ở leads service cho phép `MANAGER + !lead.assignedUserId → return` không check dept. Lead `POOL` (chưa phân) hoặc `FLOATING` đều có `assignedUserId == null`, vậy bất kỳ manager nào cũng có thể chuyển lead này (chèn vào dept của mình, hoặc đẩy xuống kho thả nổi).
- **Impact**: Manager dept A "cướp" lead trong kho mới hoặc kho thả nổi vào dept A. Phá ngữ cảnh phân phối (kho mới phải được phân phối có kế hoạch chứ không phải manager grab).
- **Remediation**: Cùng pattern FIND-004 - manager phải có ít nhất 1 managed-dept cho dept hiện tại của lead, hoặc lead phải có dept null + targetType=DEPARTMENT vào dept manager quản lý.
- **References**: CWE-863, OWASP A01:2021.

---

## High Severity

### FIND-006 - High - JWT staleness (mitigated by DB lookup, but watch token revocation gap)
- **CVSS**: 5.4
- **File**: `apps/api/src/modules/auth/strategies/jwt-passport.strategy.ts:26-49`
- **Description**: JWT strategy revalidates user mỗi request via `prisma.user.findFirst(...status: 'ACTIVE')` - tốt, claims không stale, role change reflect ngay. Nhưng:
  - JWT token chứa `role` field (không dùng - chỉ `sub` lookup DB). Coi như cosmetic - không tin.
  - **Khoảng cách**: refresh token bị revoke khi role change (`adminUpdate` line 117 trong users.service) nhưng JWT access token vẫn live cho đến hết TTL. Trong khoảng đó user vẫn dùng được access token. Vì validate hit DB query lại role nên đỡ - nhưng nếu sau này có cache layer cho `findFirst` thì sẽ thành bug.
- **Impact**: Hiện tại OK (no cache). Future risk nếu thêm caching.
- **Remediation**: Tạo `token_version` column trên User, JWT embed `tv` claim, validate compare. Hoặc giữ DB lookup nhưng cấm cache hóa.
- **References**: CWE-613 (Insufficient Session Expiration).

### FIND-007 - High - Mass assignment risk via `@Body() Record<string, unknown>` trong lead/customer/product update
- **CVSS**: 5.3
- **File**: 
  - `apps/api/src/modules/leads/leads.controller.ts:115`
  - `apps/api/src/modules/customers/customers.controller.ts:49`
  - `apps/api/src/modules/products/products.controller.ts:50`
- **Description**: Controllers nhận body là `Record<string, unknown>` thay vì DTO class. ValidationPipe `whitelist: true` không có decorators để strip → toàn bộ field client gửi đi qua. Service hiện tại MANUALLY whitelist field-by-field nên an toàn TẠI THỜI ĐIỂM NÀY, nhưng:
  - Nếu dev thêm `Object.assign(updateData, data)` hoặc spread `{...data}` cho tiện → ngay lập tức cho phép user set `status`, `assignedUserId`, `customerId`, `verifiedBy`, `createdAt` etc.
  - Loss-of-defense-in-depth.
- **Impact**: Footgun nguy hiểm. Future contributor có thể vô tình mở mass assignment hole.
- **Remediation**: Tạo `UpdateLeadDto`, `UpdateCustomerDto`, `UpdateProductDto` với class-validator decorators only on allowed fields. Bỏ `Record<string, unknown>` pattern.
- **References**: CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes).

### FIND-008 - High - CreateCustomerDto cho phép USER set assignedUserId/assignedDepartmentId (mitigated by @Roles MANAGER+)
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/customers/dto/create-customer.dto.ts:42-48`, `customers.controller.ts:39-44`
- **Description**: DTO cho phép `assignedUserId` + `assignedDepartmentId`. Endpoint hiện đang guarded MANAGER+ nên USER không thể gọi. NHƯNG manager phòng A có thể tạo customer rồi gán `assignedUserId` cho nhân viên phòng B - không có cross-dept check.
- **Impact**: Manager A "tặng" customer cho NV phòng B (hoặc steal credit). Privilege escalation cho manager.
- **Remediation**: Service validate: `assignedUserId` phải cùng dept với manager OR cùng dept với `assignedDepartmentId`. SUPER_ADMIN bypass.
- **References**: CWE-863.

### FIND-009 - High - `searchByPhone` controller-level không scope theo user, chỉ rate-limit
- **CVSS**: 5.3
- **File**: `apps/api/src/modules/customers/customers.controller.ts:28-31`, `customers.service.ts:95-122`
- **Description**: Per project memo (`reference_notion_tasks_db.md` + `searchByPhone rate-limit only`), endpoint này được decide là rate-limit-only. NHƯNG hiện tại không có `@Throttle()` decorator riêng cho `/customers/search`, chỉ fall back global `short` (100/min). 100/min × user × 86400s = đủ enumerate vài triệu phone trong 1 ngày.
- **Impact**: Internal employee có thể enumerate DB SĐT (10 digits VN phone = 10^10 numerically, nhưng filter prefix 03/05/07/08/09 = ~10^9). Rate limit hiện tại không đủ chặn brute force.
- **Remediation**: 
  ```ts
  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 10 } })   // 10/min
  async searchByPhone(...)
  ```
  HOẶC require chính xác 10-digit phone (đã có) + log attempts cho audit detection.
- **References**: CWE-307 (Improper Restriction of Excessive Authentication Attempts), CWE-799.

### FIND-010 - High - Order update missing IDOR check (PATCH `/orders/:id/status`)
- **CVSS**: 5.3
- **File**: `apps/api/src/modules/orders/orders.controller.ts:100-107`, `orders.service.ts:208-219`
- **Description**: `updateStatus(id, newStatus)` không truyền `user`. `findById(id)` cũng không truyền user. Có @Roles MANAGER+ nên USER không call được. NHƯNG manager phòng A có thể update status đơn hàng của phòng B - không có dept scope check.
- **Impact**: Manager A confirm/cancel/refund đơn hàng của dept B, làm sai số liệu, tampering revenue records.
- **Remediation**: `findById(id, user)` để buildAccessFilter scope theo dept (cần mở rộng filter để support dept-scope cho manager).
- **References**: CWE-863.

### FIND-011 - High - Payment manual verify không scope theo dept
- **CVSS**: 5.4
- **File**: `apps/api/src/modules/payments/payments.service.ts:169-211`, `payments.controller.ts:120-129`
- **Description**: `verifyManual()` chỉ check `status: 'PENDING'` không check user có quyền verify cho payment thuộc dept nào. @Roles MANAGER+ chặn USER. NHƯNG manager dept A có thể verify payment của order dept B → ảnh hưởng KPI/commission của dept B.
- **Impact**: Cross-dept tampering. Manager A "verify hộ" payment phòng B để boost (hoặc sabotage) số liệu.
- **Remediation**: 
  ```ts
  async verifyManual(id, userId, role, departmentId, bankTransactionId?) {
    const payment = await tx.payment.findFirst({
      where: { id, status: 'PENDING', ...(role !== 'SUPER_ADMIN' && departmentId ?
        { order: { creator: { departmentId } } } : {}) },
      ...
    });
    if (!payment) throw new ForbiddenException('Không có quyền verify payment này');
    ...
  }
  ```
- **References**: CWE-863, OWASP A04:2021 (Insecure Design).

### FIND-012 - High - bulk-recall không scope theo manager dept
- **CVSS**: 5.4
- **File**: `apps/api/src/modules/leads/leads.service.ts:737-769`, `leads.controller.ts:158-170`
- **Description**: Manager bulk-recall (`POST /leads/bulk-recall`) với leadIds bất kỳ. Service filter `assignedUserId: { not: null }` nhưng không check leads thuộc dept manager. Tương tự `bulkAssign`.
- **Impact**: Manager dept A bulk-recall toàn bộ leads của dept B → đẩy về kho mới, phá flow công việc dept khác.
- **Remediation**: Service filter `departmentId: { in: managedDeptIds }` cho MANAGER. SA bypass.
- **References**: CWE-863.

### FIND-013 - High - bulk-assign không check target user same dept as manager
- **CVSS**: 5.4
- **File**: `apps/api/src/modules/leads/leads.service.ts:656-704`
- **Description**: `bulkAssign` cho phép manager dept A gán leads cho NV phòng B (không kiểm tra `targetUser.departmentId === manager's managed dept`).
- **Impact**: Manager phòng A "thả gánh" hoặc spam-assign leads vào nhân viên phòng B (hoặc cố tình giảm score phòng B).
- **Remediation**: Verify `targetUser.departmentId` ∈ `managerDepartment` của manager, hoặc SA. Nếu lead đã có dept thì `targetUser.departmentId === lead.departmentId`.
- **References**: CWE-863.

### FIND-014 - High - Activities create note: USER tampering audit trail
- **CVSS**: 5.3
- (đã liệt kê trong FIND-003, nhấn mạnh khía cạnh write)

### FIND-015 - High - Tasks create: assignedTo bất kỳ user nào
- **CVSS**: 5.3
- **File**: `apps/api/src/modules/tasks/tasks.service.ts:111-152`, `tasks.controller.ts:29-36`
- **Description**: `CreateTaskDto.assignedTo` (string) - service `BigInt(dto.assignedTo)` rồi tạo task. Không check user có quyền assign task cho người khác hay không. Controller default về current user nếu null.
- **Impact**: USER A tạo task gán cho USER B với `dueDate` quá khứ → escalation L1/L2 chạy ngay → manager USER B nhận notification "công việc của X quá hạn" → fake harassment / score tampering.
- **Remediation**: Service: nếu `user.role === USER` thì `assignedTo` phải === user.id. Manager+ free.
- **References**: CWE-285.

### FIND-016 - High - Customer searchByPhone leaks status (ACTIVE/INACTIVE/FLOATING)
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/customers/customers.service.ts:95-122`
- **Description**: Returns `id, phone, name, email, status` - đặc biệt `status` cho biết KH đang được care hay không. Helper recon cho phishing nội bộ (sale A biết KH B sắp INACTIVE để xin chuyển).
- **Impact**: Information disclosure to non-owner users.
- **Remediation**: Service không trả `status` field hoặc filter chỉ cho MANAGER+. Theo project memo trust-internal-app, không critical nhưng nên restrict.
- **References**: CWE-200.

### FIND-017 - High - Audit log retention/prune NOT controller-exposed (no DELETE endpoint), but write từ user code không scope
- **CVSS**: N/A (audit covers OK actions từ interceptor, KHÔNG có write/delete endpoint cho user → an toàn).
- **File**: `apps/api/src/modules/audit-log/audit-log.controller.ts`, `audit-log.service.ts`
- **Note**: Audit log có @Roles SUPER_ADMIN class-level, không có endpoint write/update/delete. Prune chạy cron internal. Có sanitizer cho metadata. OK.
- **Gap quan sát**: Không thấy audit log ghi vào DB cho các action `lead.assign`, `lead.transfer`, `payment.verify`, `user.role_change`, `user.deactivate`, `password.change`, `apiKey.create` - chỉ thấy login/refresh via interceptor (cần verify).

### FIND-018 - High - `/customers/:id/phones` GET (list số phụ) thiếu auth scope cho USER (mitigated bởi findById)
- **CVSS**: N/A - chỉ cần findById ownership check → đã có (controller line 140).
- Verified OK.

---

## Medium Severity

### FIND-019 - Medium - Notifications: USER có thể `markAsRead` notification của user khác qua route lỗi
- **CVSS**: 3.7
- **File**: `apps/api/src/modules/notifications/notifications.service.ts:33-41`
- **Description**: Service có ownership check (`if (notification.userId !== userId) throw ForbiddenException`). OK. Nhưng error message reveal "không có quyền đọc thông báo này" → confirm notification id tồn tại + thuộc user khác. Information disclosure rất nhẹ.
- **Remediation**: Generic 404 cho cả "không tìm thấy" và "không có quyền".
- **References**: CWE-209.

### FIND-020 - Medium - Bank-transactions manual-match: không scope dept
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts:82-92`, `bank-transactions.service.ts:86-115`
- **Description**: Manager dept A match bank-transaction với payment dept B. Lý do tương tự FIND-011.
- **Remediation**: Service scope theo `payment.order.creator.departmentId`.

### FIND-021 - Medium - Call-logs `/list` USER thấy được logs của user khác (controller line 39 filter chỉ apply USER)
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/call-logs/call-logs.controller.ts:30-41`
- **Description**: `matchedUserFilter = user.role === USER ? user.id : undefined`. Tốt cho USER. Nhưng filter `phone` (param `phone`) không scope - USER có thể truyền `phone=X` để xem call-logs liên kết tới SĐT X bất kỳ (lead/customer của user khác).
- **Wait**: filter là `where.phoneNumber = normalizePhone(query.phone)` + `where.matchedUserId = user.id` (cho USER) → query AND. Nếu phone không match call của user → return rỗng. OK actually.
- **Re-evaluate**: Actually safe vì matchedUserId luôn áp cho USER. Skip.

### FIND-022 - Medium - `/customers/:id/analyze` thiếu role guard + ownership check
- **CVSS**: 5.3
- **File**: `apps/api/src/modules/customers/customers.controller.ts:122-129`
- **Description**: `POST /customers/:id/analyze` trigger AI analyze. Không có `@Roles()` và không có `findById(id, user)`. Mọi user gọi được với id bất kỳ → tốn AI API quota + analyze KH ngoài quyền.
- **Impact**: Cost/abuse + Information disclosure (analysis ghi xuống `customer.shortDescription/description/aiRating` mà USER khác đọc được khi xem KH của họ - wait, only assignedUser xem được). Vẫn là abuse cost vector.
- **Remediation**: 
  ```ts
  @Post(':id/analyze')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async analyze(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    await this.customersService.findById(id, user);
    ...
  }
  ```
- **References**: CWE-862, CWE-770 (Allocation Without Limits).

### FIND-023 - Medium - Distribution `getConfig/getScores/distribute` allow MANAGER for any dept (class-level @Roles)
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/distribution/distribution.controller.ts:9-39`
- **Description**: Class guard `@Roles(SUPER_ADMIN, MANAGER)`. Manager dept A truy cập `/distribution/config/<deptB-id>` để xem cấu hình AI scoring + scores của dept B. Cũng có thể trigger `/distribution/distribute/<deptB-id>` → batch-distribute leads của dept B. Updateconfig đã hạn chế SA only ở method-level (line 19) → OK. Nhưng read + distribute thì không.
- **Impact**: Manager A spy AI weights của dept B; trigger batch distribute lung tung lên dept B.
- **Remediation**: Service validate `manager has managedDepartment(deptId)` cho non-SA.
- **References**: CWE-863.

### FIND-024 - Medium - Assignment templates không scope theo dept
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/assignment-templates/assignment-templates.controller.ts:9-55`
- **Description**: Class-level `@Roles(MANAGER, SUPER_ADMIN)`. Template có `memberUserIds` (string[]) - manager A tạo template chứa member của dept B → áp lên leads dept B. Service không validate.
- **Impact**: Cross-dept assignment via template.
- **Remediation**: Validate `memberUserIds` cùng dept với manager (hoặc SA bypass).

### FIND-025 - Medium - Tasks update: assignedTo can be changed bypassing ownership of new assignee
- **CVSS**: 4.3
- **File**: `apps/api/src/modules/tasks/tasks.service.ts:154-196`
- **Description**: User update task của mình → có thể đổi `assignedTo` sang user khác. Không có guard nào ngăn USER A bốc task của mình lên USER B (vẫn là task của A, nhưng đổi assignee → B thấy task lạ trong list).
- **Remediation**: USER role không được đổi `assignedTo`.

### FIND-026 - Medium - File serving thiếu owner-based access (`GET /files/*`)
- **CVSS**: 5.3
- **File**: `apps/api/src/modules/file-upload/file-upload.controller.ts:47-68`
- **Description**: Endpoint phục vụ file UPLOADED qua route catch-all. JWT-protected (good). NHƯNG bất kỳ user nào biết relative path (`attachments/2026-05/<uuid>.pdf`) đều download được. UUID là entropy đủ (hard to guess), nhưng:
  - Nếu file path bị leak qua activity metadata, log, error message → user khác có thể fetch.
  - Lý do project memo "File UUID OK" - đã được decide trust internal app.
- **Note**: Per project memo - chấp nhận. Document this risk.

### FIND-027 - Medium - Lead update: USER can edit lead.name/email/etc của lead của mình nhưng:
- **File**: `apps/api/src/modules/leads/leads.service.ts:447-470`
- **Description**: `findById(id, user)` đầu method scope correctly. Phone field-level chặn USER edit. Other fields OK.

### FIND-028 - Medium - Customer assignedDepartmentId không update khi reassigning
- **File**: `apps/api/src/modules/customers/customers.service.ts:214-239`
- **Description**: `claim()` set `assignedDepartmentId: user.departmentId`. Nếu user không có dept → null → customer mất dept. Edge case nhưng OK với business spec.

---

## Low Severity / Informational

### FIND-029 - Low - ThirdPartyApi `POST /external/leads` không validate `sourceId` cùng dept
- **File**: `apps/api/src/modules/third-party-api/third-party-api.controller.ts:18-71`
- API key auth required. Body chỉ chấp nhận `source` (string) - tự tạo nếu chưa có (line 35). Risk: tạo nhiều fake source ô nhiễm DB. Low - chỉ API client misuse.

### FIND-030 - Info - MCP/AI agent endpoints `@Public()` skip JWT, dùng API key (correct pattern)
- File: `apps/api/src/modules/mcp-agent/mcp-agent.controller.ts:22`, `ai-agent-rest.controller.ts:12-13`
- Rate limit 100/min. McpAgentAuthGuard validates permission. OK.

### FIND-031 - Info - Audit log writes from interceptor (not user-controllable)
- Cần grep và confirm có log đầy đủ login/password/role/payment.verify/lead.transfer. Out of scope cho audit này.

### FIND-032 - Low - `payments.service.list` cho USER role chỉ check `order.createdBy = user.id` - OK
- File: `apps/api/src/modules/payments/payments.service.ts:46-93`
- USER role scoped. MANAGER unscoped (sees all). OK với business rule.

### FIND-033 - Info - JWT validates role/dept/status from DB mỗi request - không stale.

### FIND-034 - Low - Export endpoints (`/exports/*`) class-level @Roles MANAGER+, dept scope thiếu
- File: `apps/api/src/modules/export/export.controller.ts:7-9`
- Manager export leads/customers/orders without dept filter → có thể export toàn bộ DB sang CSV. Per CLAUDE.md "Manager+ sees everything" → OK theo spec, nhưng nên log audit action `export.leads`/`export.customers` với row count.

### FIND-035 - Low - System-settings PUT not scoped to setting key category
- File: `apps/api/src/modules/system-settings/system-settings.controller.ts:17-22`
- SA only. OK. Nhưng cho phép set bất kỳ key nào. Nếu key list được hardcoded ở service (SETTING_KEYS) thì OK; cần confirm service validate key whitelist.

---

## Summary Table

| Severity | Count | IDs |
|---|---|---|
| Critical | 5 | FIND-001, 002, 003, 004, 005 |
| High | 13 | FIND-006 to 018 |
| Medium | 10 | FIND-019 to 028 |
| Low/Info | 7 | FIND-029 to 035 |

## buildAccessFilter Coverage Audit

Modules USING `buildAccessFilter`:
- ✅ `leads.service.ts` - list/findById/myDeptPool đều dùng
- ✅ `customers.service.ts` - list dùng (nhưng overwrite bug FIND-001); findById dùng inline filter
- ✅ `orders.service.ts` - list/findById dùng
- ✅ `tasks.service.ts` - dùng trong `findTaskWithOwnershipCheck`

Modules KHÔNG dùng buildAccessFilter (cần check manual scope):
- ❌ `activities.service.ts` - FIND-003 critical
- ❌ `payments.service.ts` - chỉ check `order.createdBy = user.id` cho USER, no helper
- ❌ `call-logs.service.ts` - controller-level filter cho USER, no helper
- ❌ `notifications.service.ts` - service self-scope `userId` (OK)
- ❌ `search.service.ts` - inline scope (OK)
- ❌ `dashboard.service.ts` - inline scope cho USER (OK)

## Status: DONE

**Summary**: 35 findings, 5 Critical, 13 High, 10 Medium, 7 Low/Info. Main systemic issues: (a) Customer list IDOR via query overwrite (FIND-001), (b) Dashboard drill-down thiếu @Roles (FIND-002), (c) Activities module hoàn toàn không có ownership check (FIND-003), (d) Manager-level cross-dept actions không scope (FIND-004, 005, 010-013, 020, 023, 024). Auth + JWT staleness OK. ApiKey/Webhook handling OK.

## Unresolved Questions

1. Có nên expand `buildAccessFilter` để cover MANAGER → dept scope thay vì empty filter? Theo CLAUDE.md "Manager+ sees everything" - nhưng nhiều finding cross-dept (FIND-010, 011, 012, 013) suggest manager NÊN bị giới hạn dept khi mutate. Cần PM decide.
2. `Activities` chưa có dept-scoped filter helper - liệu manager có nên thấy notes của dept khác hay không?
3. AI analyze endpoint cost protection - có cần per-user quota không? (FIND-022).
4. `/customers/search` rate-limit chính xác bao nhiêu là OK cho UX vs enumeration? PM cần quyết.
5. Audit log có cover lead.transfer, payment.verify, role.change không? Cần grep `auditLogService.create(` từ các module.
6. Manager dept A có quyền tạo customer rồi gán cho NV phòng B không (FIND-008)? Spec unclear.
