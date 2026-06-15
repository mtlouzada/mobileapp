// Submit a skate spot to Hive. A spot is a normal snap (comment under the
// peak.snaps container) tagged "skatespot" with a canonical body the spotmap
// sync knows how to parse. Mirrors the web composer so the existing sync picks
// it up unchanged.

import { comment, getLastSnapsContainer, COMMUNITY_TAG } from "~/lib/hive-utils";

export interface SpotMedia {
  /** Markdown image lines and/or video iframes already uploaded, in order. */
  imageUrls: string[];
  videoIframes: string[];
}

export interface SubmitSpotInput {
  username: string;
  privateKey: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  description?: string;
  media: SpotMedia;
}

export interface SubmitSpotResult {
  author: string;
  permlink: string;
}

const SPOT_TAG = "skatespot";

function generateSpotPermlink(): string {
  const ts = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  // Append a short random suffix so two spots created in the same second by the
  // same account don't collide on the permlink (Hive rejects duplicates).
  const rand = Math.random().toString(36).slice(2, 8);
  return `skatespot-${ts.substring(0, 15)}-${rand}`;
}

/**
 * Build the canonical spot body the spotmap parser expects:
 *
 *   Spot Name: <name>
 *   🌐 <lat>, <lng> (<address>)
 *
 *   <description>
 *
 *   ![spot](image-url)
 *   <iframe ...></iframe>
 */
export function buildSpotBody(input: Omit<SubmitSpotInput, "username" | "privateKey">): string {
  const { name, lat, lng, address, description, media } = input;
  const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const locationLine = address ? `🌐 ${coords} (${address})` : `🌐 ${coords}`;

  const parts: string[] = [`Spot Name: ${name.trim()}`, locationLine];

  const desc = description?.trim();
  if (desc) parts.push("", desc);

  const mediaLines = [...media.imageUrls, ...media.videoIframes];
  if (mediaLines.length > 0) parts.push("", mediaLines.join("\n"));

  return parts.join("\n");
}

/**
 * Broadcast the spot snap. Returns the author + permlink so the caller can
 * optimistically pin it and trigger the targeted server sync.
 */
export async function submitSpot(input: SubmitSpotInput): Promise<SubmitSpotResult> {
  const { username, privateKey } = input;

  // Post under the latest snaps container so the spotmap sync's
  // parent_permlink filter matches (same as the web composer). If the container
  // lookup fails we must abort: a top-level post (parent_author="") would carry
  // the tag but NOT match the sync's parent_permlink filter, so it would never
  // be ingested — and the caller would falsely report success.
  let parentAuthor: string;
  let parentPermlink: string;
  try {
    const container = await getLastSnapsContainer();
    parentAuthor = container.author;
    parentPermlink = container.permlink;
  } catch (err) {
    throw new Error(
      "Couldn't reach Hive to post the spot. Check your connection and try again."
    );
  }

  const permlink = generateSpotPermlink();
  const body = buildSpotBody(input);
  const jsonMetadata = {
    app: "mycommunity-mobile",
    tags: [COMMUNITY_TAG, SPOT_TAG],
  };

  await comment(privateKey, parentAuthor, parentPermlink, username, permlink, "", body, jsonMetadata);

  return { author: username, permlink };
}
