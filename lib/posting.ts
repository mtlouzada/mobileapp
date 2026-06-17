import type { AuthSession } from "./types";
import { vote as hiveVote, comment as hiveComment } from "./hive-utils";
import { vote as ubVote, comment as ubComment } from "./userbase/api";

// Unified posting seam. Server-custody email (userbase) accounts route to the
// api.skatehive.app endpoints (server signs); classic Hive-key accounts sign
// locally with the decrypted posting key as before.

export function isUserbaseSession(session: AuthSession | null | undefined): boolean {
  return !!session && session.kind === "userbase" && !!session.userbaseToken;
}

/** True if the session can post at all (has a local key OR is a userbase session). */
export function canPost(session: AuthSession | null | undefined): boolean {
  if (!session || session.username === "SPECTATOR") return false;
  return isUserbaseSession(session) || !!session.decryptedKey;
}

export async function castVote(
  session: AuthSession,
  author: string,
  permlink: string,
  weight: number
): Promise<void> {
  if (isUserbaseSession(session)) {
    const r = await ubVote(session.userbaseToken!, { author, permlink, weight });
    if (!r.success) throw new Error(r.error || "Vote failed");
    return;
  }
  await hiveVote(session.decryptedKey, session.username, author, permlink, weight);
}

export interface PostCommentArgs {
  parentAuthor: string;
  parentPermlink: string;
  body: string;
  permlink?: string;
  title?: string;
  jsonMetadata?: Record<string, unknown>;
}

export async function postComment(
  session: AuthSession,
  args: PostCommentArgs
): Promise<{ author: string; permlink: string }> {
  if (isUserbaseSession(session)) {
    const r = await ubComment(session.userbaseToken!, {
      parent_author: args.parentAuthor,
      parent_permlink: args.parentPermlink,
      body: args.body,
      permlink: args.permlink,
      title: args.title,
      json_metadata: args.jsonMetadata,
    });
    if (!r.success) throw new Error(r.error || "Comment failed");
    return { author: r.author || session.username, permlink: r.permlink || args.permlink || "" };
  }
  const permlink = args.permlink || `re-${Date.now().toString(36)}`;
  await hiveComment(
    session.decryptedKey,
    args.parentAuthor,
    args.parentPermlink,
    session.username,
    permlink,
    args.title || "",
    args.body,
    args.jsonMetadata || {}
  );
  return { author: session.username, permlink };
}
