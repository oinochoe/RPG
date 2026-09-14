import { Hono } from "hono";
import { cors } from "hono/cors";
import { ApiError, errorResponseFromApiError, unknownErrorResponse } from "./errors.ts";
import { authRoutes } from "./auth.ts";
import { charactersRoutes } from "./characters.ts";
import { mapsRoutes } from "./maps.ts";

const app = new Hono().basePath("/api");

// The R3F client is a browser app served from an evolving set of dev/prod
// origins (localhost:517x during development, an eventual static host in
// production). This is a public API authenticated via Bearer tokens (not
// cookies), so a permissive origin reflection is safe: there is no
// cookie-based session for a malicious page to ride along on.
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

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
