import { json } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";

const PAGE_SIZE = 25;
const SORTS = {
  newest: "u.created_at DESC",
  oldest: "u.created_at ASC",
  name: "u.last_name COLLATE NOCASE ASC, u.first_name COLLATE NOCASE ASC",
  ideas: "idea_count DESC, u.created_at DESC",
};

// Search and list members. `q` matches name, email, phone or title.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = cleanString(url.searchParams.get("q") || "", 80);
  const status = url.searchParams.get("status") || "";
  const sort = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "newest";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const where = [];
  const params = [];

  if (q) {
    // Escape the LIKE wildcards so a literal % or _ searches for itself.
    const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `((u.first_name || ' ' || u.last_name) LIKE ? ESCAPE '\\'
        OR u.email LIKE ? ESCAPE '\\'
        OR u.phone LIKE ? ESCAPE '\\'
        OR u.title LIKE ? ESCAPE '\\')`
    );
    params.push(term, term, term, term);
  }

  if (["pending", "active", "suspended"].includes(status)) {
    where.push("u.status = ?");
    params.push(status);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u ${clause}`)
    .bind(...params)
    .first();

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.title, u.status,
            u.email_verified_at, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM ideas i WHERE i.user_id = u.id) AS idea_count,
            (SELECT COUNT(*) FROM ideas i WHERE i.user_id = u.id AND i.status = 'approved')
              AS approved_count
       FROM users u
       ${clause}
      ORDER BY ${SORTS[sort]}
      LIMIT ? OFFSET ?`
  )
    .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all();

  const total = countRow ? countRow.n : 0;
  return json({
    users: results.map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      title: row.title,
      status: row.status,
      emailVerifiedAt: row.email_verified_at,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      ideaCount: row.idea_count,
      approvedCount: row.approved_count,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
  });
}
