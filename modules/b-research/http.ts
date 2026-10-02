import { ZodError } from "zod";

export function jsonError(error: unknown, requestId = crypto.randomUUID()) {
  const validation = error instanceof ZodError || error instanceof Error && /必填|无效|不符合契约/.test(error.message);
  return Response.json({ error: { code: validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR", message: error instanceof Error ? error.message : "请求处理失败", retryable: false, requestId } }, { status: validation ? 422 : 500 });
}
