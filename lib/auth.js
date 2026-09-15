import { randomToken, sha256Hex } from "./crypto.js";
import { isoIn, nowIso } from "./http.js";

export const USER_COOKIE = "okayma_session";
export const ADMIN_COOKIE = "okayma_admin";

const USER_SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_SECONDS = 60 * 60 * 8; //      8 hours
export const LINK_SECONDS = 60 * 60 * 24; //       verification links: 24 hours

function cookieAttributes(request, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function clearCookie(request, name) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

// Creates a session row and returns the Set-Cookie header value. Only the
// hash of the cookie value is persisted.
export async function createSession(db, request, { kind, userId = null }) {
  const raw = randomToken();
  const maxAge = kind === "admin" ? ADMIN_SESSION_SECONDS : USER_SESSION_SECONDS;
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(await sha256Hex(raw), userId, kind, nowIso(), isoIn(maxAge))
    .run();

  const name = kind === "admin" ? ADMIN_COOKIE : USER_COOKIE;
  return `${name}=${raw}; ${cookieAttributes(request, maxAge)}`;
}

export async function destroySession(db, request, kind) {
  const name = kind === "admin" ? ADMIN_COOKIE : USER_COOKIE;
  const raw = readCookie(request, name);
  if (raw) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(raw)).run();
  }
  return clearCookie(request, name);
}

// Resolves the signed-in member, or null. Suspended accounts resolve to null
// so a suspension takes effect on the next request without hunting sessions.
export async function currentUser(db, request) {
  const raw = readCookie(request, USER_COOKIE);
  if (!raw) return null;

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.title, u.status
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.kind = 'user' AND s.expires_at > ?`
    )
    .bind(await sha256Hex(raw), nowIso())
    .first();

  if (!row || row.status !== "active") return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title,
    status: row.status,
  };
}

export async function isAdmin(db, request) {
  const raw = readCookie(request, ADMIN_COOKIE);
  if (!raw) return false;
  const row = await db
    .prepare("SELECT id FROM sessions WHERE id = ? AND kind = 'admin' AND expires_at > ?")
    .bind(await sha256Hex(raw), nowIso())
    .first();
  return Boolean(row);
}

// Issues a single-use link token and returns the raw value for the email.
export async function issueToken(db, userId, purpose) {
  const raw = randomToken();
  await db
    .prepare(
      `INSERT INTO tokens (token_hash, user_id, purpose, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(await sha256Hex(raw), userId, purpose, isoIn(LINK_SECONDS), nowIso())
    .run();
  return raw;
}

// Consumes a link token. Returns the user id, or null when it is unknown,
// expired or already used.
export async function consumeToken(db, raw, purpose) {
  if (!raw) return null;
  const hash = await sha256Hex(raw);
  const row = await db
    .prepare(
      "SELECT user_id, expires_at, used_at FROM tokens WHERE token_hash = ? AND purpose = ?"
    )
    .bind(hash, purpose)
    .first();

  if (!row || row.used_at || row.expires_at <= nowIso()) return null;

  await db.prepare("UPDATE tokens SET used_at = ? WHERE token_hash = ?").bind(nowIso(), hash).run();
  return row.user_id;
}

// Opportunistic cleanup so expired rows do not accumulate forever.
export async function pruneExpired(db) {
  const now = nowIso();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM tokens WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE reset_at <= ?").bind(now),
  ]);
}
