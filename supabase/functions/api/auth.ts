import { Hono } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError, readJsonBody } from "./errors.ts";

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const { email, password } = await readJsonBody(c);
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw new ApiError(400, "validation_failed", "invalid_request", "email and password are required.");
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError(400, "validation_failed", "weak_password", "비밀번호는 최소 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다.", "password");
  }

  const admin = getAdminClient();

  const { data: existing, error: existingCheckError } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingCheckError) {
    // Fail closed: every other Supabase call in this file checks `error` —
    // silently ignoring it here would let a transient DB failure masquerade
    // as "no existing user" and let registration proceed unchecked.
    console.error("existence check failed during registration:", existingCheckError.message);
    throw new ApiError(500, "internal_error", "registration_check_failed", "회원가입 처리 중 오류가 발생했습니다.");
  }
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
    // Don't leak raw GoTrue error text to the client (schema/internals
    // reconnaissance risk, e.g. constraint names) — log it server-side and
    // return a static message instead.
    console.error("createUser failed during registration:", signUpError?.message);
    throw new ApiError(400, "validation_failed", "registration_failed", "회원가입 처리 중 오류가 발생했습니다.");
  }

  const { error: insertError } = await admin.from("users").insert({
    auth_user_id: signUpData.user.id,
    email,
    role: "user",
    status: "active",
  });
  if (insertError) {
    // Roll back the orphaned auth user so the operation is atomic from the
    // caller's perspective — otherwise this email could never register
    // again (GoTrue already has it) nor ever log in (no matching
    // public.users row for requireAuth to find), a permanent DoS against
    // that address.
    const { error: deleteError } = await admin.auth.admin.deleteUser(signUpData.user.id);
    if (deleteError) {
      console.error("Failed to roll back orphaned auth user after insert failure:", deleteError.message);
    }
    // Don't leak raw Postgres error text to the client — log it server-side
    // and return a static message instead.
    console.error("users row insert failed during registration:", insertError.message);
    throw new ApiError(500, "internal_error", "user_row_insert_failed", "회원가입 처리 중 오류가 발생했습니다.");
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

// Lets a user who never received (or lost) the signup confirmation email trigger
// another one, without a working session — mirrors registration's own use of
// auth.resend({ type: 'signup', email }). Deliberately does NOT reveal whether the
// email is registered or already verified (same email-enumeration concern as
// register's 409 vs. this route): any outcome other than a rate limit returns 200,
// with the real result only logged server-side. Rate limits ARE surfaced distinctly
// so a user who double-clicks understands why nothing happened, rather than being
// told "sent" and left waiting on an email that never comes.
authRoutes.post("/resend-verification", async (c) => {
  const { email } = await readJsonBody(c);
  if (typeof email !== "string" || !email) {
    throw new ApiError(400, "validation_failed", "invalid_request", "email is required.", "email");
  }

  const admin = getAdminClient();
  const { error } = await admin.auth.resend({ type: "signup", email });
  if (error) {
    if (error.status === 429 || /rate.?limit/i.test(error.message ?? "")) {
      throw new ApiError(429, "rate_limited", "resend_rate_limited", "잠시 후 다시 시도해주세요.");
    }
    console.error("resend-verification failed:", error.message);
  }

  return c.json({}, 200);
});

authRoutes.post("/login", async (c) => {
  const { email, password } = await readJsonBody(c);
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw new ApiError(400, "validation_failed", "invalid_request", "email and password are required.");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    // Distinguish "email not confirmed" from genuinely wrong credentials —
    // GoTrue reports this as AuthApiError with code "email_not_confirmed"
    // (also surfaced as status 400). Collapsing it into invalid_credentials
    // tells a legitimate unconfirmed user "you typed it wrong" instead of
    // "verify your email first."
    if (error?.code === "email_not_confirmed") {
      throw new ApiError(403, "forbidden", "email_unverified", "이메일 인증을 완료한 후 이용할 수 있습니다.");
    }
    throw new ApiError(401, "unauthorized", "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

authRoutes.post("/refresh", async (c) => {
  const { refresh_token } = await readJsonBody(c);
  if (typeof refresh_token !== "string" || !refresh_token) {
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
    // Still always respond 204 (idempotent per contract) even on failure,
    // but log a real revocation failure instead of silently discarding it —
    // otherwise a genuine GoTrue outage/error on a VALID token is
    // indistinguishable from the expected "already invalid token" case,
    // with zero way to ever detect the session wasn't actually revoked.
    //
    // NOTE: like the other auth.* calls in this file, signOut() resolves
    // with `{ error }` on API-level failures (e.g. a 403 bad_jwt) rather
    // than rejecting — confirmed by observing the deployed function's logs
    // for a garbage-token call, where a bare `.catch()` never fired. So we
    // must check the resolved `error`, not just catch a thrown exception
    // (kept as a fallback for genuine network-level failures).
    const { error: signOutError } = await admin.auth.admin
      .signOut(accessToken)
      .catch((err) => ({ error: err }));
    if (signOutError) {
      console.error("logout signOut failed:", signOutError);
    }
  }

  return c.body(null, 204);
});

authRoutes.post("/verify-email", async (c) => {
  const { token } = await readJsonBody(c);
  if (typeof token !== "string" || !token) {
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
