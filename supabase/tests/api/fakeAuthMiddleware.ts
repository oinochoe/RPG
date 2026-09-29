// Test stand-in for functions/api/authMiddleware.ts: every request is user 1 (no JWT check).
export interface AppUser {
  id: number;
  auth_user_id: string;
  email: string;
  role: string;
  status: string;
}

export const requireAuth = async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
  c.set("appUser", { id: 1, auth_user_id: "u", email: "t@t", role: "user", status: "active" });
  await next();
};
