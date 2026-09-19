import { redirect, nowIso } from "../../../lib/http.js";
import { sha256Hex } from "../../../lib/crypto.js";

// Landing point for the emailed confirmation link. Confirming moves the
// testimonial into the moderation queue; it does not publish it.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirect("/testimonials?confirm=invalid");

  const hash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT id, status, confirm_expires_at
         FROM testimonials
        WHERE confirm_hash = ?`
    )
    .bind(hash)
    .first();

  if (!row) return redirect("/testimonials?confirm=invalid");

  // Following the link twice should reassure rather than alarm: the first
  // click already did the work.
  if (row.status !== "unconfirmed") return redirect("/testimonials?confirm=already");

  if (!row.confirm_expires_at || row.confirm_expires_at <= nowIso()) {
    return redirect("/testimonials?confirm=expired");
  }

  // The hash is deliberately kept. Clearing it would make a second click on
  // the same link indistinguishable from a forged one, and the person would be
  // told their valid link was invalid and asked to start again. The status
  // check above is what prevents reuse; the hash only identifies which row the
  // link belongs to.
  await db
    .prepare(
      `UPDATE testimonials
          SET status = 'pending',
              confirmed_at = ?,
              confirm_expires_at = NULL
        WHERE id = ?`
    )
    .bind(nowIso(), row.id)
    .run();

  return redirect("/testimonials?confirm=ok");
}
