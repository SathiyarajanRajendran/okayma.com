import { sniffImageType } from "../../../../lib/images.js";

// Serves a team member's portrait straight from the row.
//
// The response type is sniffed from the stored bytes rather than read back
// from the stored `photo_type`, so even a row edited by hand can only ever be
// served as an image format a browser will render inertly.
export async function onRequestGet({ env, request, params }) {
  const row = await env.DB.prepare(
    `SELECT photo, photo_type, photo_updated_at, status
       FROM team_members
      WHERE id = ?`
  )
    .bind(params.id)
    .first();

  if (!row || !row.photo || row.status !== "published") {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const bytes = new Uint8Array(row.photo);
  const type = sniffImageType(bytes) || "application/octet-stream";
  if (type === "application/octet-stream") {
    // Stored bytes that are not an image are a data problem, not something to
    // hand to a browser and hope.
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${row.photo_updated_at || "0"}-${bytes.length}"`;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.length),
      ETag: etag,
      // Safe to cache hard: the URL carries photo_updated_at, so replacing the
      // portrait produces a different URL rather than a stale hit.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
