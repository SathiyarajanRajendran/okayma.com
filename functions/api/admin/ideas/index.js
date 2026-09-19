import { json } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";
import { isStage } from "../../../../lib/stages.js";

const PAGE_SIZE = 20;

// The moderation queue. Defaults to everything; filter by status to work
// through the pending ones.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = cleanString(url.searchParams.get("q") || "", 80);
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const where = [];
  const params = [];

  if (q) {
    const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(i.title LIKE ? ESCAPE '\\'
        OR i.description LIKE ? ESCAPE '\\'
        OR (u.first_name || ' ' || u.last_name) LIKE ? ESCAPE '\\'
        OR u.email LIKE ? ESCAPE '\\')`
    );
    params.push(term, term, term, term);
  }

  if (["pending", "approved", "rejected"].includes(status)) {
    where.push("i.status = ?");
    params.push(status);
  }

  const stage = url.searchParams.get("stage") || "";
  if (stage && isStage(stage)) {
    where.push("i.stage = ?");
    params.push(stage);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ideas i JOIN users u ON u.id = i.user_id ${clause}`
  )
    .bind(...params)
    .first();

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.description, i.status, i.stage, i.stage_changed_at,
            i.created_at, i.decided_at, i.admin_note,
            u.id AS user_id, u.first_name, u.last_name, u.email, u.title AS author_title,
            u.status AS user_status
       FROM ideas i
       JOIN users u ON u.id = i.user_id
       ${clause}
      ORDER BY CASE i.status WHEN 'pending' THEN 0 ELSE 1 END, i.created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all();

  const total = countRow ? countRow.n : 0;
  return json({
    ideas: results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      stage: row.stage,
      stageChangedAt: row.stage_changed_at,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      adminNote: row.admin_note,
      author: {
        id: row.user_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        title: row.author_title,
        status: row.user_status,
      },
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
  });
}
