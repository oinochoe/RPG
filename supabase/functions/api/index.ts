import { Hono } from "hono";
import { ApiError, errorResponseFromApiError, unknownErrorResponse } from "./errors.ts";
import { authRoutes } from "./auth.ts";

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return errorResponseFromApiError(err);
  }
  return unknownErrorResponse(err);
});

Deno.serve(app.fetch);
