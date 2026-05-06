# Phase 02 - Backend Service + Cron

**Priority:** P0 | **Status:** ✅ Completed | **Effort:** 3h | **Depends on:** P1

## Overview
Update `TasksService` để CRUD reminders nested trong task payload. Refactor cron `processReminders` từ check 1 column trên Task → query bảng `task_reminders`.

## Requirements
- API `POST /tasks` nhận `reminders: { remindAt, label }[]`
- API `PATCH /tasks/:id` hỗ trợ replace toàn bộ reminders (strategy: delete all + recreate)
- Cron query `TaskReminder where remindAt <= now AND remindedAt IS NULL`
- Backend auto-compute 3 default reminders nếu FE không gửi `reminders` mà có `dueDate`
- Validate: max 5 reminders/task, `remindAt < dueDate`

## DTO Changes

**File:** `apps/api/src/modules/tasks/dto/create-task.dto.ts` (và update-task.dto.ts)

```ts
export class TaskReminderDto {
  @IsISO8601()
  remindAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;
}

export class CreateTaskDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() assignedTo!: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TaskReminderDto)
  reminders?: TaskReminderDto[];
}
```

## Service Logic

**File:** `apps/api/src/modules/tasks/tasks.service.ts`

### Helper: auto-compute defaults
```ts
private computeDefaultReminders(dueDate: Date, now = new Date()) {
  const candidates = [
    { offset: 24 * 60 * 60 * 1000, label: '1 ngày trước' },
    { offset: 60 * 60 * 1000,      label: '1 giờ trước' },
    { offset: 30 * 60 * 1000,      label: '30 phút trước' },
  ];
  return candidates
    .map(c => ({ remindAt: new Date(dueDate.getTime() - c.offset), label: c.label }))
    .filter(r => r.remindAt > now);
}
```

### `create()`
```ts
async create(dto: CreateTaskDto, userId: bigint) {
  const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

  // Reminders: lấy từ DTO nếu có, nếu không có thì auto-compute từ dueDate
  let reminders = dto.reminders ?? [];
  if (reminders.length === 0 && dueDate) {
    reminders = this.computeDefaultReminders(dueDate);
  }

  // Validate: remindAt < dueDate
  if (dueDate) {
    for (const r of reminders) {
      if (new Date(r.remindAt) >= dueDate) {
        throw new BadRequestException('Mốc nhắc phải trước hạn công việc');
      }
    }
  }

  return this.prisma.task.create({
    data: {
      title: dto.title,
      description: dto.description,
      assignedTo: BigInt(dto.assignedTo),
      createdBy: userId,
      dueDate,
      status: 'PENDING',
      entityType: dto.entityType,
      entityId: dto.entityId ? BigInt(dto.entityId) : null,
      reminders: reminders.length ? {
        create: reminders.map(r => ({
          remindAt: new Date(r.remindAt),
          label: r.label ?? null,
        })),
      } : undefined,
    },
    include: { reminders: true },
  });
}
```

### `update()` - strategy: delete all + recreate nếu `reminders` có trong payload
```ts
async update(id: bigint, dto: UpdateTaskDto, userId: bigint) {
  const existing = await this.prisma.task.findUnique({ where: { id } });
  if (!existing) throw new NotFoundException();

  const newDueDate = dto.dueDate !== undefined
    ? (dto.dueDate ? new Date(dto.dueDate) : null)
    : existing.dueDate;

  return this.prisma.$transaction(async (tx) => {
    // Nếu FE gửi reminders → replace
    if (dto.reminders !== undefined) {
      await tx.taskReminder.deleteMany({ where: { taskId: id } });
      if (dto.reminders.length) {
        await tx.taskReminder.createMany({
          data: dto.reminders.map(r => ({
            taskId: id,
            remindAt: new Date(r.remindAt),
            label: r.label ?? null,
          })),
        });
      }
    }

    return tx.task.update({
      where: { id },
      data: {
        // ... các field khác
        dueDate: newDueDate,
      },
      include: { reminders: true },
    });
  });
}
```

### Cron refactor
```ts
@Cron('*/5 * * * *')
async processReminders() {
  const now = new Date();

  // Query reminders đến hạn
  const dueReminders = await this.prisma.taskReminder.findMany({
    where: {
      remindAt: { lte: now },
      remindedAt: null,
      task: { status: 'PENDING' },
    },
    include: { task: true },
    take: 500, // batch limit
  });

  if (dueReminders.length === 0) return;

  // Tạo notification
  const notifications = dueReminders.map(r => ({
    userId: r.task.assignedTo,
    title: `${r.label ?? 'Nhắc nhở'}: ${r.task.title}`,
    content: r.task.dueDate
      ? `Hạn: ${formatVnDateTime(r.task.dueDate)}`
      : 'Công việc đến hạn nhắc',
    type: 'TASK_REMIND',
    referenceType: r.task.entityType ?? 'TASK',
    referenceId: r.task.entityId ?? r.task.id,
  }));

  await this.prisma.$transaction([
    this.prisma.notification.createMany({ data: notifications }),
    this.prisma.taskReminder.updateMany({
      where: { id: { in: dueReminders.map(r => r.id) } },
      data: { remindedAt: now },
    }),
  ]);

  this.logger.log(`Đã gửi ${dueReminders.length} nhắc nhở`);
}
```

### Escalation logic - giữ nguyên (vẫn dựa vào `dueDate` + `escalation1At/2At` trên Task).

## Implementation Steps
1. Update DTOs với `TaskReminderDto` + `reminders` array (max 5)
2. Thêm helper `computeDefaultReminders`
3. Refactor `create()` + `update()` dùng nested write / transaction
4. Refactor cron `processReminders` query bảng mới
5. Viết unit test cho helper + cron
6. Smoke test: POST /tasks với/không reminders, PATCH update reminders
7. Verify cron chạy (có thể tạm set `*/1` để test, đổi lại sau)

## Todo
- [x] Update DTOs
- [x] Helper `computeDefaultReminders`
- [x] Refactor `create`
- [x] Refactor `update` (transaction)
- [x] Refactor cron
- [x] Unit test service
- [x] Smoke test manual (curl hoặc Swagger)

## Success Criteria
- POST /tasks không `reminders` + có `dueDate` → auto tạo 3 reminders (filter past)
- POST /tasks với `reminders` → tạo chính xác các mốc user gửi
- PATCH /tasks/:id thay `reminders` → delete cũ, create mới
- Cron gửi notification đúng type `TASK_REMIND` + đúng referenceType/Id
- Reminders đã gửi rồi (`remindedAt IS NOT NULL`) không gửi lại
- Max 5 reminders - validation reject 422 nếu > 5

## Risks
- Transaction rollback khi prisma lỗi - đã dùng `$transaction`
- Cron race condition nếu 2 instance chạy đồng thời → hiện tại chỉ 1 instance, OK

## Security
- Validate `assignedTo` thuộc dept/user hợp lệ (existing check)
- Không leak task của user khác qua referenceId
