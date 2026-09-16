// Token, hashing and password primitives built on WebCrypto, which is
// available in the Workers runtime.

const encoder = new TextEncoder();

export function randomId() {
  return crypto.randomUUID();
}

// 32 bytes of entropy, URL-safe. Used for verification links and session ids.
export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 100000 is the Workers runtime's hard ceiling: above it PBKDF2 throws
// NotSupportedError in production. The local dev runtime does NOT enforce this,
// so a higher value passes every local test and then fails only once deployed.
// Do not raise this number.
const PBKDF2_ITERATIONS = 100000;

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.includes("$")) return false;
  const [saltHex, expected] = stored.split("$");
  if (!saltHex || !expected) return false;
  // Deliberately NOT wrapped in try/catch. A WebCrypto failure here is a
  // server problem, and reporting it as `false` would make it indistinguishable
  // from a wrong password — which is exactly how the iteration-cap bug above
  // stayed hidden. The caller turns a throw into a 503.
  const actual = (await hashPassword(password, saltHex)).split("$")[1];
  return timingSafeEqual(actual, expected);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
