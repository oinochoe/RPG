import { MiddlewareHandler } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError } from "./errors.ts";
import type { AppUser } from "./authMiddleware.ts";
import { GAME_SESSION_HEADER, checkGameSession } from "./gameSession.ts";

// Rejects requests from a game session that has been replaced. Runs after requireAuth, so appUser is
// already the verified token owner; the comparison is against that user's ACTIVE character only.
export const requireGameSession: MiddlewareHandler = async (c, next) => {
  const appUser = c.get("appUser") as AppUser;
  const admin = getAdminClient();
  const { data: active, error } = await admin
    .from("characters")
    .select("game_session_id")
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("game session lookup failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "session_check_failed", "접속 확인 중 오류가 발생했습니다.");
  }

  const result = checkGameSession(c.req.header(GAME_SESSION_HEADER), active);
  if (result === "no_active_character") {
    // Same answer the routes themselves give when nothing is selected.
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (result !== "ok") {
    throw new ApiError(409, "conflict", "session_replaced", "다른 곳에서 접속하여 이 접속은 종료되었습니다.");
  }
  await next();
};
