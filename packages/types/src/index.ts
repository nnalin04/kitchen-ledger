// @kitchenledger/types
// Generated from OpenAPI specs of all services (Phase 2+).
// Currently contains foundational shared types only.

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface EventEnvelope<T = unknown> {
  event_id: string;
  event_type: string;
  tenant_id: string;
  produced_by: string;
  produced_at: string;
  version: string;
  payload: T;
}

export type UserRole = 'owner' | 'manager' | 'kitchen_staff' | 'server';

export interface UserContext {
  user_id: string;
  tenant_id: string;
  role: UserRole;
  email: string;
}
