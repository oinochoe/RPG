import { Hono } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError } from "./errors.ts";

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    throw new ApiError(400, "validation_failed", "invalid_request", "email and password are required.");
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError(400, "validation_failed", "weak_password", "비밀번호는 최소 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다.", "password");
  }

  const admin = getAdminClient();

  const { data: existing } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    throw new ApiError(409, "conflict", "email_already_registered", "이미 등록된 이메일 주소입니다.", "email");
  }

  // Create the auth user via the admin API so we control `email_confirm`
  // (left false/unconfirmed). NOTE: admin.createUser does NOT send any
  // email on its own — confirmed via Step 1 docs lookup — so we trigger
  // the confirmation email separately below via auth.resend().
  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (signUpError || !signUpData.user) {
    throw new ApiError(400, "validation_failed", "registration_failed", signUpError?.message ?? "Registration failed.");
  }

  const { error: insertError } = await admin.from("users").insert({
    auth_user_id: signUpData.user.id,
    email,
    role: "user",
    status: "active",
  });
  if (insertError) {
    throw new ApiError(500, "internal_error", "user_row_insert_failed", insertError.message);
  }

  // Trigger Supabase's templated signup-confirmation email. admin.createUser
  // above creates the user silently, so we explicitly resend the "signup"
  // confirmation email (confirmed via Step 1 docs: auth.resend({ type: 'signup', email })
  // is the documented way to (re)send a signup confirmation for an existing,
  // unconfirmed user). Don't fail registration if this errors — the user
  // row already exists; just log for observability.
  const { error: resendError } = await admin.auth.resend({ type: "signup", email });
  if (resendError) {
    console.error("Failed to send signup confirmation email:", resendError.message);
  }

  return c.json({}, 201);
});

authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    throw new ApiError(400, "validation_failed", "invalid_request", "email and password are required.");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new ApiError(401, "unauthorized", "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

authRoutes.post("/refresh", async (c) => {
  const { refresh_token } = await c.req.json();
  if (!refresh_token) {
    throw new ApiError(400, "validation_failed", "invalid_request", "refresh_token is required.", "refresh_token");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    throw new ApiError(401, "unauthorized", "token_expired_or_invalid", "유효하지 않거나 만료된 토큰입니다.");
  }

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

authRoutes.post("/logout", async (c) => {
  // Logout is idempotent per the contract (204 even for an unknown/expired
  // token) — never throw if revocation fails, just always return 204.
  //
  // IMPORTANT (Step 1 finding): admin.signOut() takes the user's ACCESS
  // TOKEN (JWT), not the refresh token — confirmed via docs
  // (auth-admin-signout: "using that user's access token (JWT)"; param
  // named `jwt`). The brief's reference code passed `body.refresh_token`,
  // which is wrong. The client (src/api/client.ts) sends the access token
  // in the `Authorization: Bearer <token>` header on every authenticated
  // request, including logout, so we read it from there instead.
  const authHeader = c.req.header("Authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (accessToken) {
    const admin = getAdminClient();
    await admin.auth.admin.signOut(accessToken).catch(() => {});
  }

  return c.body(null, 204);
});

authRoutes.post("/verify-email", async (c) => {
  const { token } = await c.req.json();
  if (!token) {
    throw new ApiError(400, "validation_failed", "invalid_request", "token is required.", "token");
  }

  const admin = getAdminClient();
  // Confirmed via Step 1 docs (auth-verifyotp "Verify Email Auth (Token
  // Hash)" example): { token_hash, type: 'email' } is correct for
  // confirming a signup via the token hash from the confirmation link.
  const { error } = await admin.auth.verifyOtp({
    token_hash: token,
    type: "email",
  });
  if (error) {
    throw new ApiError(400, "invalid_token", "token_expired_or_invalid", "유효하지 않거나 만료된 인증 토큰입니다.", "token");
  }

  return c.json({});
});
