// Client for the mobile email-OTP auth endpoints on api.skatehive.app.
// Server-custody: we only ever hold an opaque bearer session token; the server
// signs Hive actions. No posting key on the device.

const BASE = "https://api.skatehive.app/api/userbase";

export interface UserbaseUser {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  status?: string;
  onboarding_step?: number;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !(data as any)?.error) {
    throw new Error(`Request failed (${res.status})`);
  }
  return data as T;
}

export interface RequestOtpResult { success: boolean; error?: string }
export function requestOtp(email: string): Promise<RequestOtpResult> {
  return postJson("/auth/otp/request", { email });
}

export interface VerifyOtpResult {
  success: boolean;
  token?: string;
  user?: UserbaseUser;
  signupRequired?: boolean;
  signupToken?: string;
  error?: string;
}
export function verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
  return postJson("/auth/otp/verify", { email, code });
}

export interface CompleteSignupResult {
  success: boolean;
  token?: string;
  user?: UserbaseUser;
  error?: string;
}
export function completeSignup(
  signupToken: string,
  handle: string,
  displayName?: string
): Promise<CompleteSignupResult> {
  return postJson("/auth/signup/complete", {
    signupToken,
    handle,
    display_name: displayName,
  });
}

export interface CheckUsernameResult { valid: boolean; available: boolean; reason?: string }
export async function checkUsername(name: string): Promise<CheckUsernameResult> {
  const res = await fetch(`${BASE}/hive/check-username?name=${encodeURIComponent(name)}`);
  return (await res.json()) as CheckUsernameResult;
}

export interface SessionResult { success: boolean; user?: UserbaseUser; error?: string }
export async function getSession(token: string): Promise<SessionResult> {
  const res = await fetch(`${BASE}/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json().catch(() => ({ success: false }))) as SessionResult;
}

export function logout(token: string): Promise<{ success: boolean }> {
  return postJson("/auth/logout", {}, token);
}
