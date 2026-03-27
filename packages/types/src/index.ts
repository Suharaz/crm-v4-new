// Shared types, DTOs, and interfaces for CRM V4
// Will be populated in Phase 02+ as modules are implemented

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
