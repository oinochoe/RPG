import { Hono } from "hono";
import { ApiError, errorResponseFromApiError, unknownErrorResponse } from "./errors.ts";
import { authRoutes } from "./auth.ts";
import { charactersRoutes } from "./characters.ts";
import { mapsRoutes } from "./maps.ts";

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);
app.route("/characters", charactersRoutes);
app.route("/exploration", mapsRoutes);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return errorResponseFromApiError(err);
  }
  return unknownErrorResponse(err);
});

Deno.serve(app.fetch);
