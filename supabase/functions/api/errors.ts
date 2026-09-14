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
  return new Response(JSON.stringify(err.body), {
    status: err.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function unknownErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : "Unknown error";
  const body: ApiErrorBody = {
    error: "internal_error",
    trace_id: crypto.randomUUID(),
    message,
  };
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
