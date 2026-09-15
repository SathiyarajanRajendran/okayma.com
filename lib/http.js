// Small helpers shared by every API route.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function fail(status, message, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export function redirect(url, cookie) {
  const headers = { Location: url, "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 302, headers });
}

export async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

// SameSite=Lax already blocks cookies on cross-site POSTs; checking Origin as
// well means a state-changing call has to come from our own pages.
export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // same-origin navigations often omit it
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function nowIso() {
  return new Date().toISOString();
}

export function isoIn(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
