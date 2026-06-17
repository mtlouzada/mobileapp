import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { fetchSoftPosts, type SoftPostOverlay } from "./api";

// Masks the shared @skateuser account with the real author behind each post.
// Posts authored by a shared account are registered as they render; the provider
// batches lookups to /api/userbase/soft-posts and caches the result so each
// (author, permlink) is fetched once.

const SHARED_ACCOUNTS = new Set(["skateuser"]);
const keyOf = (author: string, permlink: string) => `${author}/${permlink}`;

interface SoftPostCtx {
  register: (author: string, permlink: string) => void;
  get: (author: string, permlink: string) => SoftPostOverlay | null;
}
const Ctx = createContext<SoftPostCtx | null>(null);

export function SoftPostProvider({ children }: { children: React.ReactNode }) {
  const [overlays, setOverlays] = useState<Record<string, SoftPostOverlay | null>>({});
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const pending = useRef<Map<string, { author: string; permlink: string }>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const batch = Array.from(pending.current.values());
    pending.current.clear();
    if (batch.length === 0) return;
    try {
      const results = await fetchSoftPosts(batch);
      setOverlays((prev) => {
        const next = { ...prev };
        // Mark every requested key resolved (null = not a soft post) so we don't refetch.
        for (const b of batch) next[keyOf(b.author, b.permlink)] = next[keyOf(b.author, b.permlink)] ?? null;
        for (const r of results) if (r.user) next[keyOf(r.author, r.permlink)] = r.user;
        return next;
      });
    } catch {
      // best-effort; leave keys unresolved so a later render can retry
    }
  }, []);

  const register = useCallback(
    (author: string, permlink: string) => {
      if (!author || !permlink || !SHARED_ACCOUNTS.has(author)) return;
      const k = keyOf(author, permlink);
      if (k in overlaysRef.current || pending.current.has(k)) return;
      pending.current.set(k, { author, permlink });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 200);
    },
    [flush]
  );

  const get = useCallback(
    (author: string, permlink: string) => overlays[keyOf(author, permlink)] ?? null,
    [overlays]
  );

  return <Ctx.Provider value={{ register, get }}>{children}</Ctx.Provider>;
}

/** Returns the real author overlay for a (possibly shared-account) post, or null. */
export function useSoftPostOverlay(author: string, permlink: string): SoftPostOverlay | null {
  const ctx = useContext(Ctx);
  useEffect(() => {
    ctx?.register(author, permlink);
  }, [ctx, author, permlink]);
  return ctx?.get(author, permlink) ?? null;
}
