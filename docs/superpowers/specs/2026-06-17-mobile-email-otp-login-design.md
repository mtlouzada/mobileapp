# Mobile Email + OTP Login (Lite Accounts) — Design Spec

**Date:** 2026-06-17
**Branch:** `email-login` (mobileapp)
**Status:** Draft for review

## Goal

Let people use the SkateHive mobile app with **just an email address** — no Hive
posting key, no seed phrase — mirroring the web app's "userbase / lite account"
system. Posting, voting, and commenting work immediately; the heavy lifting
(key custody, signing) happens server-side.

This is **additive**: the existing Hive-posting-key login (local, client-signed)
stays exactly as-is. Email login is a second auth method alongside it.

## Decisions (locked)

- **Login = email OTP** (6-digit code), fully in-app. No magic-link/redirect.
- **Endpoints live on `api.skatehive.app`** (`skatehive-api`), not the website —
  decoupled from skatehive.app's Vercel firewall.
- **Server-custody (Model A):** the device **never holds a Hive posting key**.
  It stores only an opaque bearer session token. The server signs every action
  (with the user's stored key, or the shared `skateuser` account for lite users).
  → This entirely avoids on-device key crypto (the PIN/KDF problems are N/A here).
- **Account creation is deferred until after OTP verification** (proving the
  email exists). On a first-time email, the user then **chooses a Hive username**
  that is format-valid and **available on-chain**, so it can be claimed later if
  they get sponsored.

## End-to-end flow

### Returning user
1. Enter email → `POST /auth/otp/request`.
2. Enter 6-digit code → `POST /auth/otp/verify` → email found → returns
   `{ token, user }`. Store `token` in `expo-secure-store`. Logged in.

### New user (email not in DB)
1. Enter email → `POST /auth/otp/request`.
2. Enter code → `POST /auth/otp/verify` → email **not** found → returns
   `{ signupRequired: true, signupToken }` (short-lived, proves email verified).
3. App shows "choose your username". As the user types, debounce-call
   `GET /hive/check-username?name=…` → `{ valid, available, reason? }`
   (Hive format rules + on-chain existence check).
4. Submit → `POST /auth/signup/complete { signupToken, handle, display_name? }`
   → creates `userbase_users` + email `userbase_auth_methods` + a session →
   returns `{ token, user }`. Logged in.

### Posting (any userbase user)
- App calls `POST /hive/comment` or `/hive/vote` with `Authorization: Bearer <token>`.
- Server resolves the signer: **stored key** (decrypt `userbase_hive_keys`) if the
  user has one, else the **shared `skateuser`** account.
- Broadcasts via dhive (already present in skatehive-api), records
  `userbase_soft_posts` / `userbase_soft_votes`, and embeds
  `json_metadata.skatehive_user = <safe HMAC id>` on comments for overlay.

### Feed attribution overlay
- The feed batch-calls `POST /soft-posts` with the `(author, permlink, safe_user)`
  of visible `@skateuser` posts and overlays the **real** user's display name /
  avatar / profile link (mirrors the web's `SoftPostContext`).

## Server endpoints (`skatehive-api`, under `/api/userbase/…`)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/otp/request` | none | `{ email }` → `{ success, expires_at }` |
| POST | `/auth/otp/verify` | none | `{ email, code }` → `{ token, user }` **or** `{ signupRequired, signupToken }` |
| GET  | `/hive/check-username` | none | `?name=` → `{ valid, available, reason? }` |
| POST | `/auth/signup/complete` | signupToken | `{ signupToken, handle, display_name? }` → `{ token, user }` |
| GET  | `/auth/session` | Bearer | → `{ user }` |
| POST | `/auth/logout` | Bearer | → `{ success }` |
| POST | `/hive/comment` | Bearer | `{ parent_author, parent_permlink, body, permlink?, title?, json_metadata?, beneficiaries? }` → `{ author, permlink }` |
| POST | `/hive/vote` | Bearer | `{ author, permlink, weight }` → `{ success }` |
| POST | `/soft-posts` | none | `{ posts: [{author, permlink, safe_user?}] }` → `{ results: [...real user...] }` |

**Bearer model:** reuse `userbase_sessions` exactly like the web, but return the
opaque token in the JSON body and accept it via `Authorization: Bearer` (the web
reads it from an httpOnly cookie — we add a header path; cookie path untouched).

**Encryption parity:** `USERBASE_KEY_ENCRYPTION_SECRET` must be the **same value**
as skatehive3.0 so the API can decrypt keys the web stored and produce matching
soft-post HMAC ids (`safeUser` falls back to this secret).

## Data model

Reuse existing `userbase_*` tables: `users`, `auth_methods`, `sessions`,
`hive_keys`, `soft_posts`, `soft_votes`. **New:** OTP storage — a short
`userbase_email_otps { email, code_hash, expires_at, consumed_at, attempts }`
(or reuse `userbase_magic_links` with a hashed code). 5–10 min TTL, max ~5
attempts, single-use, atomic consume (same TOCTOU-safe pattern the web uses for
magic links). **Confirm exact schema before building.**

`userbase_users.handle` = the chosen Hive username. Note: the name is only
*reserved logically* until an on-chain account is claimed via sponsorship, so two
new users could pick the same still-available name before either is sponsored —
acceptable (the web's sponsorship flow resolves claiming); flag for later.

## Infra / env (copy from skatehive3.0 → skatehive-api, same Vercel team)

- `USERBASE_KEY_ENCRYPTION_SECRET` (exact match — decrypt + HMAC)
- `DEFAULT_HIVE_POSTING_ACCOUNT`, `DEFAULT_HIVE_POSTING_KEY` (shared `skateuser`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, `EMAIL_PASS` (OTP email)
- Add `nodemailer` dependency to skatehive-api.

These are production secrets; copy via the Vercel CLI **only on explicit go-ahead**.

## Mobile (`mobileapp`)

- **Login UI:** email screen → OTP screen → (new users) username screen with live
  availability check. New components under `components/auth/`.
- **AuthProvider:** add a `userbase` session type `{ kind: 'userbase', token, user }`
  alongside the existing `{ kind: 'hive', decryptedKey }`. Token in `expo-secure-store`.
- **Posting branch:** a single `postComment` / `vote` seam that routes userbase
  sessions to the server endpoints and classic Hive-key sessions to the existing
  local dhive path. Keep blast radius small — one decision point.
- **Feed overlay:** mirror the web's batched `SoftPostContext` to show real authors.

## Security

- OTP: hashed at rest, short TTL, attempt cap, single-use, request rate-limit per
  email/IP. Never log codes.
- Bearer token: opaque (hashed in `userbase_sessions`), stored in `expo-secure-store`,
  revocable via `/auth/logout`; honor the 30-day expiry.
- The decrypted posting key **never** leaves the server.
- `/hive/*` endpoints validate the bearer session and rate-limit.

## Phases

1. **Server auth:** env provisioning + `nodemailer`; `/auth/otp/*`,
   `/auth/signup/complete`, `/hive/check-username`, bearer `/auth/session` + `/logout`.
2. **Server posting:** bearer-aware `/hive/comment` + `/vote` + `/soft-posts`
   (port the web's logic, reuse skatehive-api's dhive broadcasting).
3. **Mobile auth:** login screens + AuthProvider userbase session + token storage.
4. **Mobile posting + overlay:** server-signed posting branch + feed overlay.

Each phase is independently shippable/testable; mobile can develop against the
deployed server endpoints.

## Out of scope (for now)

- EVM / Farcaster identities, account merge, sponsorship/upgrade flow.
- Migrating `sync-one` (spotmap ingest) — unrelated.
- The native-PBKDF2 hardening for the *classic* key login (separate effort).
- Biometric for userbase sessions (token alone is sufficient; can add Face ID
  gating on app open later).

## Open questions

1. OTP storage: new `userbase_email_otps` table vs reuse `userbase_magic_links`?
   (Depends on the live schema — confirm.)
2. Username reservation: do we want a soft "reserved handles" guard to reduce
   collisions before sponsorship, or accept the rare clash?
3. Display name / avatar at signup: required or optional (default from handle)?
