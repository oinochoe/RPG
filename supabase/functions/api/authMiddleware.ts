import { MiddlewareHandler } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError } from "./errors.ts";

export interface AppUser {
  id: number;
  email: string;
  role: string;
  status: string;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthenticated", "missing_token", "인증이 필요합니다.");
  }
  const token = authHeader.slice("Bearer ".length);

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new ApiError(401, "unauthenticated", "invalid_token", "유효하지 않은 토큰입니다.");
  }

  const { data: appUser, error: appUserError } = await admin
    .from("users")
    .select("id, email, role, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (appUserError || !appUser) {
    throw new ApiError(401, "unauthenticated", "invalid_token", "유효하지 않은 토큰입니다.");
  }
  if (appUser.status === "suspended") {
    throw new ApiError(403, "forbidden", "account_suspended", "이용이 정지된 계정입니다.");
  }

  c.set("appUser", appUser as AppUser);
  await next();
};
