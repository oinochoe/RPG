import { Hono } from "hono";
import { ApiError, errorResponseFromApiError, unknownErrorResponse } from "./errors.ts";

const app = new Hono().basePath("/functions/v1/api");

app.get("/health", (c) => c.json({ status: "ok" }));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return errorResponseFromApiError(err);
  }
  return unknownErrorResponse(err);
});

Deno.serve(app.fetch);
