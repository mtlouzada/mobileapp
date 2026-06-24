import * as SecureStore from "expo-secure-store";
import type { AuthSession } from "../types";
import { WEB_BASE_URL } from "../constants";

// A classic Hive-key account has no userbase session of its own. To use the
// skatehive3.0 server-custody features that are keyed on a userbase user
// (Instagram cross-post + IG handle), we bootstrap the Hive account into
// userbase the same way the web does (/api/userbase/auth/bootstrap), then carry
// the returned session token as a `Cookie: userbase_refresh=…` header (React
// Native can't use the httpOnly cookie the browser gets). The token is cached
// on-device and reused until it expires.

const TOKEN_KEY = "hive_userbase_refresh_token";
const META_KEY = "hive_userbase_session_meta"; // { username, expiresAt }

interface StoredMeta {
  username: string;
  expiresAt: string;
}

async function loadStored(): Promise<{ token: string; meta: StoredMeta } | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const metaRaw = await SecureStore.getItemAsync(META_KEY);
    if (!token || !metaRaw) return null;
    return { token, meta: JSON.parse(metaRaw) as StoredMeta };
  } catch {
    return null;
  }
}

function isValidFor(stored: { token: string; meta: StoredMeta } | null, username: string): boolean {
  if (!stored) return false;
  if (stored.meta.username !== username) return false;
  // Refresh a day early to avoid edge-of-expiry failures.
  return new Date(stored.meta.expiresAt).getTime() - Date.now() > 24 * 60 * 60 * 1000;
}

async function bootstrap(username: string): Promise<{ token: string; expiresAt: string } | null> {
  const res = await fetch(`${WEB_BASE_URL}/api/userbase/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client": "mobile" },
    body: JSON.stringify({
      type: "hive",
      identifier: username,
      handle: username,
      display_name: username,
      avatar_url: `https://images.hive.blog/u/${username}/avatar`,
      return_token: true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    refresh_token?: string;
    expires_at?: string;
  };
  if (!res.ok || !data?.refresh_token || !data?.expires_at) return null;
  await SecureStore.setItemAsync(TOKEN_KEY, data.refresh_token);
  await SecureStore.setItemAsync(
    META_KEY,
    JSON.stringify({ username, expiresAt: data.expires_at } as StoredMeta)
  );
  return { token: data.refresh_token, expiresAt: data.expires_at };
}

/**
 * Ensure the logged-in classic Hive-key account has a userbase session, and
 * return the Cookie header to authenticate to skatehive3.0. Lazily bootstraps
 * (and caches) on first use; reuses the stored token until it nears expiry.
 * Returns null for non-key accounts or if bootstrap fails.
 */
export async function getUserbaseCookieHeader(
  session: AuthSession | null | undefined
): Promise<Record<string, string> | null> {
  if (!session?.username || session.username === "SPECTATOR") return null;
  if (session.kind === "userbase" || !session.decryptedKey) return null; // classic-key only

  const stored = await loadStored();
  let token = isValidFor(stored, session.username) ? stored!.token : null;
  if (!token) {
    const fresh = await bootstrap(session.username);
    token = fresh?.token ?? null;
  }
  if (!token) return null;
  return { Cookie: `userbase_refresh=${token}` };
}

export async function clearHiveUserbaseSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(META_KEY);
}
