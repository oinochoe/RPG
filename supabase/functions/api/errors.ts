import type { Context } from "hono";

export interface ApiErrorBody {
  error: string;
  trace_id: string;
  message: string;
  field?: string;
  reason?: string;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(
    status: number,
    error: string,
    reason: string,
    message: string,
    field?: string,
  ) {
    super(message);
    this.status = status;
    this.body = {
      error,
      trace_id: crypto.randomUUID(),
      message,
      reason,
      ...(field ? { field } : {}),
    };
  }
}

export function errorResponseFromApiError(err: ApiError): Response {
  // Log every error response server-side, keyed by its trace_id, so support
  // can actually correlate a client-reported trace_id back to what happened
  // (previously trace IDs were minted but never logged anywhere).
  console.error(`[${err.body.trace_id}] api error:`, err.body.error, err.body.reason, err.message);
  return new Response(JSON.stringify(err.body), {
    status: err.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function unknownErrorResponse(err: unknown): Response {
  const traceId = crypto.randomUUID();
  // Never leak raw JS/runtime exception text to the client (it can include
  // things like literal request body contents, e.g. a JSON.parse error
  // message). Log the real error server-side, keyed by trace_id, and return
  // a static message.
  console.error(`[${traceId}] unhandled error:`, err instanceof Error ? (err.stack ?? err.message) : err);
  const body: ApiErrorBody = {
    error: "internal_error",
    trace_id: traceId,
    message: "서버 오류가 발생했습니다.",
    reason: "internal_error",
  };
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

// Shared safe body parser: every handler that reads a JSON body should use
// this instead of a bare `await c.req.json()`, which throws a raw
// SyntaxError straight into unknownErrorResponse() on malformed input
// (leaking parser internals) or crashes downstream destructuring when the
// body is valid JSON but not an object (e.g. `null`, `"foo"`, `[1,2]`).
export async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "validation_failed", "invalid_request", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "요청 본문이 올바른 JSON 객체가 아닙니다.");
  }
  return body as Record<string, unknown>;
}
