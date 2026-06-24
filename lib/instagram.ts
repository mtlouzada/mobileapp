import { sha256 } from "js-sha256";
import { PrivateKey } from "@hiveio/dhive";
import { Buffer } from "buffer";
import { API_ORIGIN } from "./constants";
import { HiveClient, convertVestToHive } from "./hive-utils";
import type { AuthSession } from "./types";

// Client for the skatehive-api Instagram cross-post + IG-handle endpoints.
// Auth is a per-request Hive posting-key signature (no session/cookie). The
// server (api.skatehive.app) holds the Meta tokens and enforces the >=100 HP
// gate, 7/24h cap, dedupe, and caption. Never log keys here.

export const MIN_HP_TO_CROSSPOST = 100;

/** Classic Hive-key account (has a local posting key to sign with). */
export function eligibleForCrosspost(session: AuthSession | null | undefined): boolean {
  return !!session && session.kind !== "userbase" && !!session.decryptedKey && session.username !== "SPECTATOR";
}

// Sign sha256(message) with the posting key — matches the server's
// cryptoUtils.sha256(Buffer.from(message)) + PublicKey.verify(digest, sig).
function signMessage(message: string, wif: string): { signature: string; publicKey: string } {
  const key = PrivateKey.fromString(wif);
  const digest = Buffer.from(sha256(message), "hex");
  return { signature: key.sign(digest).toString(), publicKey: key.createPublic().toString() };
}

function buildIgAuthMessage(hiveAuthor: string, hivePermlink: string, issuedAt: string): string {
  return [
    "Skatehive: cross-post snap to @skatehive on Instagram.",
    `Author: @${hiveAuthor}`,
    `Permlink: ${hivePermlink}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

function buildIgHandleAuthMessage(hiveAuthor: string, issuedAt: string): string {
  return [
    "Skatehive: manage Instagram handle for @skatehive cross-posting.",
    `Author: @${hiveAuthor}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

function handleSig(session: AuthSession): { hive_author: string; hive_public_key: string; hive_signature: string; signed_at: string } {
  const issuedAt = new Date().toISOString();
  const { signature, publicKey } = signMessage(buildIgHandleAuthMessage(session.username, issuedAt), session.decryptedKey);
  return { hive_author: session.username, hive_public_key: publicKey, hive_signature: signature, signed_at: issuedAt };
}

export interface CrossPostArgs {
  permlink: string;
  body: string;
  tags?: string[];
  imageUrl?: string;
  videoUrl?: string;
  permalinkUrl: string;
}

/** Cross-post an already-broadcast snap to @skatehive on Instagram. Throws on failure. */
export async function crossPostToInstagram(
  session: AuthSession,
  args: CrossPostArgs
): Promise<{ ig_permalink?: string; deduped?: boolean }> {
  const issuedAt = new Date().toISOString();
  const { signature, publicKey } = signMessage(
    buildIgAuthMessage(session.username, args.permlink, issuedAt),
    session.decryptedKey
  );
  const res = await fetch(`${API_ORIGIN}/api/instagram/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hive_author: session.username,
      hive_permlink: args.permlink,
      body: args.body,
      tags: args.tags ?? [],
      image_url: args.imageUrl,
      video_url: args.videoUrl,
      permalink_url: args.permalinkUrl,
      hive_signature: signature,
      hive_public_key: publicKey,
      signed_at: issuedAt,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ig_permalink?: string; deduped?: boolean };
  if (!res.ok) throw new Error(data?.error || `Cross-post failed (${res.status})`);
  return data;
}

export interface IgHandleResult {
  handle: string | null;
  source: "db" | "hive" | null;
}

/** Read the user's stored IG handle. `source === null` means none set (prompt). */
export async function getIgHandle(session: AuthSession): Promise<IgHandleResult> {
  const q = new URLSearchParams(handleSig(session) as Record<string, string>);
  const res = await fetch(`${API_ORIGIN}/api/userbase/profile/instagram?${q.toString()}`);
  if (!res.ok) return { handle: null, source: null };
  return (await res.json().catch(() => ({ handle: null, source: null }))) as IgHandleResult;
}

/** Store/replace the user's IG handle. Throws on failure (e.g. handle taken). */
export async function setIgHandle(handle: string, session: AuthSession): Promise<void> {
  const res = await fetch(`${API_ORIGIN}/api/userbase/profile/instagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, ...handleSig(session) }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data?.error || `Could not save Instagram handle (${res.status})`);
  }
}

export async function deleteIgHandle(session: AuthSession): Promise<void> {
  await fetch(`${API_ORIGIN}/api/userbase/profile/instagram`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handleSig(session)),
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
