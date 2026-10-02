/**
 * C API 错误映射（规格 §4）：C 领域错误 + API 层错误 → HTTP 状态与公共错误结构
 * { error: { code, message, retryable, requestId } }。
 * 映射对齐公共底座 packages/runtime.RuntimeError 的语义（401/403/404/409/422/503）。
 */
import type { CError, CErrorCode } from '../../domain/errors.js';

export type ApiErrorCode =
  | CErrorCode
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'INVALID_JSON'
  | 'MISSING_FIELD'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'UNSUPPORTED_FORMAT'
  | 'INTERNAL_ERROR'
  | 'RUN_NOT_CANCELLABLE';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  // C 领域错误
  SCHEMA_VERSION_UNSUPPORTED: 409,
  INPUT_STRUCT_INVALID: 422,
  PROFILE_NOT_CONFIRMED: 422,
  BINDING_MISMATCH: 409,
  INTENT_CONTEXT_INSUFFICIENT: 422,
  MODE_CONFLICT: 409,
  DUPLICATE_ID: 422,
  REFERENCE_MISSING: 422,
  SCOPE_MISMATCH: 422,
  SALARY_INTERVAL_INVALID: 422,
  DUPLICATE_HARD_KEY: 422,
  PREFERENCE_INVALID: 422,
  REPORT_OUTPUT_INVALID: 500,
  // API 层错误
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_CONFIGURED: 503,
  INVALID_JSON: 422,
  MISSING_FIELD: 422,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  UNSUPPORTED_FORMAT: 422,
  INTERNAL_ERROR: 500,
  RUN_NOT_CANCELLABLE: 409,
};

const RETRYABLE_BY_CODE: Partial<Record<ApiErrorCode, boolean>> = {
  NOT_CONFIGURED: false, // 配置缺失，重试无意义；由部署方补齐后恢复
  INTERNAL_ERROR: false,
};

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, string | number | string[]>,
): { status: number; body: { error: ApiErrorBody } } {
  const status = STATUS_BY_CODE[code] ?? 500;
  const body: ApiErrorBody = {
    code,
    message: details === undefined ? message : `${message} ${JSON.stringify(details)}`,
    retryable: RETRYABLE_BY_CODE[code] ?? false,
    requestId,
  };
  return { status, body: { error: body } };
}

/** C 领域错误（如管线校验失败）→ HTTP 响应。 */
export function domainErrorResponse(
  error: CError,
  requestId: string,
): { status: number; body: { error: ApiErrorBody } } {
  return apiError(error.code, error.message, requestId, error.details);
}
