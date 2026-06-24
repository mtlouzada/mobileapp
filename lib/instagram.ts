import { WEB_BASE_URL } from "./constants";
import { HiveClient, convertVestToHive } from "./hive-utils";

// Client for the skatehive3.0 Instagram cross-post + IG-handle endpoints. The
// server (which holds the Meta tokens) enforces the >=100 HP gate, the 7/24h
// per-user cap, dedupe, and caption building. We authenticate with the
// bootstrapped userbase session passed as a Cookie header (see
// lib/userbase/hiveSession.ts). Never log keys here.

export const MIN_HP_TO_CROSSPOST = 100;

type CookieHeader = Record<string, string>;

export interface CrossPostArgs {
  author: string;
  permlink: string;
  body: string;
  tags?: string[];
  imageUrl?: string;
  videoUrl?: string;
  permalinkUrl: string;
}

/** Cross-post an already-broadcast snap to @skatehive on Instagram. Throws on failure. */
export async function crossPostToInstagram(
  args: CrossPostArgs,
  cookieHeader: CookieHeader
): Promise<{ ig_permalink?: string; deduped?: boolean }> {
  const res = await fetch(`${WEB_BASE_URL}/api/instagram/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader },
    body: JSON.stringify({
      hive_author: args.author,
      hive_permlink: args.permlink,
      body: args.body,
      tags: args.tags ?? [],
      image_url: args.imageUrl,
      video_url: args.videoUrl,
      permalink_url: args.permalinkUrl,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    ig_permalink?: string;
    deduped?: boolean;
  };
  if (!res.ok) throw new Error(data?.error || `Cross-post failed (${res.status})`);
  return data;
}

export interface IgHandleResult {
  handle: string | null;
  source: "db" | "hive" | null;
}

/** Read the user's stored IG handle. `source === null` means none set (prompt). */
export async function getIgHandle(cookieHeader: CookieHeader): Promise<IgHandleResult> {
  const res = await fetch(`${WEB_BASE_URL}/api/userbase/profile/instagram`, {
    headers: { ...cookieHeader },
  });
  if (!res.ok) return { handle: null, source: null };
  return (await res.json().catch(() => ({ handle: null, source: null }))) as IgHandleResult;
}

/** Store/replace the user's IG handle. Throws on failure (e.g. handle taken). */
export async function setIgHandle(
  handle: string,
  cookieHeader: CookieHeader,
  source = "crosspost_prompt"
): Promise<void> {
  const res = await fetch(`${WEB_BASE_URL}/api/userbase/profile/instagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader },
    body: JSON.stringify({ handle, source }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data?.error || `Could not save Instagram handle (${res.status})`);
  }
}

export async function deleteIgHandle(cookieHeader: CookieHeader): Promise<void> {
  await fetch(`${WEB_BASE_URL}/api/userbase/profile/instagram`, {
    method: "DELETE",
    headers: { ...cookieHeader },
  });
}

/** Hive Power for an account (own vests converted to HP). Returns 0 on failure. */
export async function getHivePower(username: string): Promise<number> {
  try {
    const [account] = await HiveClient.database.getAccounts([username]);
    if (!account) return 0;
    const vests = parseFloat(account.vesting_shares.toString().split(" ")[0]);
    return await convertVestToHive(vests);
  } catch {
    return 0;
  }
}
