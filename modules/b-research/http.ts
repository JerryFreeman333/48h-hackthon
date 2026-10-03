import { ZodError } from "zod";
import { RuntimeError, errorResponse } from "../../packages/runtime";
import {validationMessage} from '../../packages/integration/validation-message';

export function jsonError(error: unknown, requestId = crypto.randomUUID()) {
  if (error instanceof RuntimeError) return errorResponse(error, requestId);
  if (error instanceof SyntaxError) return errorResponse(new RuntimeError("VALIDATION_ERROR", "请求必须是有效 JSON", 422), requestId);
  const validation = error instanceof ZodError || error instanceof Error && /必填|无效|不符合契约/.test(error.message);
  return Response.json({ error: { code: validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR", message: validationMessage(error), retryable: false, requestId } }, { status: validation ? 422 : 500 });
}
