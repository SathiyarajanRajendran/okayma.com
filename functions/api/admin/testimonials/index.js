import { json } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";

const PAGE_SIZE = 20;

// The testimonial moderation queue. Unconfirmed submissions are excluded by
// default: until someone has followed the emailed link there is nothing to
// judge, and showing them would fill the queue with unverifiable claims.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = cleanString(url.searchParams.get("q") || "", 80);
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const where = [];
  const params = [];

  if (["unconfirmed", "pending", "published", "rejected"].includes(status)) {
    where.push("status = ?");
    params.push(status);
  } else {
    where.push("status != 'unconfirmed'");
  }

  if (q) {
    const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(name LIKE ? ESCAPE '\\'
        OR organisation LIKE ? ESCAPE '\\'
        OR role LIKE ? ESCAPE '\\'
        OR body LIKE ? ESCAPE '\\'
        OR email LIKE ? ESCAPE '\\')`
    );
    params.push(term, term, term, term, term);
  }

  const clause = `WHERE ${where.join(" AND ")}`;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonials ${clause}`
  )
    .bind(...params)
    .first();

  const { results } = await env.DB.prepare(
    `SELECT id, name, role, organisation, email, relationship, body, status,
            confirmed_at, created_at, decided_at, admin_note
       FROM testimonials
       ${clause}
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all();

  const total = countRow ? countRow.n : 0;
  return json({
    testimonials: results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      organisation: row.organisation,
      email: row.email,
      relationship: row.relationship,
      body: row.body,
      status: row.status,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      adminNote: row.admin_note,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
  });
}
