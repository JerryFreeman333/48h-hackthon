/**
 * C 结构化错误。P1 为纯函数管线，错误以结构化对象返回；
 * HTTP 状态映射（422/409 等）在 P2 API 层落地（规格 §4）。
 */

export type CErrorCode =
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'INPUT_STRUCT_INVALID'
  | 'PROFILE_NOT_CONFIRMED'
  | 'BINDING_MISMATCH'
  | 'INTENT_CONTEXT_INSUFFICIENT'
  | 'MODE_CONFLICT'
  | 'DUPLICATE_ID'
  | 'REFERENCE_MISSING'
  | 'SCOPE_MISMATCH'
  | 'SALARY_INTERVAL_INVALID'
  | 'DUPLICATE_HARD_KEY'
  | 'PREFERENCE_INVALID'
  | 'REPORT_OUTPUT_INVALID';

export interface CError {
  code: CErrorCode;
  message: string;
  retryable: false;
  /** 定位细节：Zod issue 路径、冲突字段 ID 等。不含画像正文，便于日志最小化（规格 §15）。 */
  details?: Record<string, string | number | string[]>;
}

export function cError(
  code: CErrorCode,
  message: string,
  details?: Record<string, string | number | string[]>,
): CError {
  return details === undefined ? { code, message, retryable: false } : { code, message, retryable: false, details };
}
