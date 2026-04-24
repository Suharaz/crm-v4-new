// Shared types, DTOs, and interfaces for CRM V4

export type BigIntString = string;

export interface ApiResponse<T> {
  data: T;
  meta?: {
    nextCursor?: string;
  };
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskReminderDto {
  remindAt: string; // ISO8601
  label?: string;
}

export interface TaskReminder {
  id: BigIntString;
  taskId: BigIntString;
  remindAt: string;
  label: string | null;
  remindedAt: string | null;
  createdAt: string;
}
