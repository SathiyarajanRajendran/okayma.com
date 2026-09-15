import { fail, json, readJson, sameOrigin, clientIp, nowIso } from "../../../lib/http.js";
import { randomId } from "../../../lib/crypto.js";
import { currentUser } from "../../../lib/auth.js";
import { validateIdea } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";

const PAGE_SIZE = 12;

// The public board. Only approved ideas are ever returned, and only the
// author's name and title travel with them — never the email or phone.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.description, i.created_at,
            u.first_name, u.last_name, u.title AS author_title
       FROM ideas i
       JOIN users u ON u.id = i.user_id
      WHERE i.status = 'approved'
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(PAGE_SIZE + 1, offset)
    .all();

  const hasMore = results.length > PAGE_SIZE;
  const ideas = results.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    author: `${row.first_name} ${row.last_name}`,
    authorTitle: row.author_title,
  }));

  return json({ ideas, page, hasMore }, 200, {
    // Short shared cache: the board is public and changes only on approval.
    "Cache-Control": "public, max-age=60",
  });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  const user = await currentUser(db, request);
  if (!user) return fail(401, "Please confirm your email and sign in before posting an idea.");

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const { ok, value, errors } = validateIdea(body);
  if (!ok) return json({ error: "Please check the highlighted fields.", fields: errors }, 422);

  const limit = await rateLimit(db, `idea:${user.id}:${clientIp(request)}`, {
    limit: 5,
    windowSeconds: 86400,
  });
  if (!limit.allowed) {
    return fail(429, "You have reached the limit of 5 ideas a day. Please come back tomorrow.", {
      retryAfter: limit.retryAfter,
    });
  }

  const id = randomId();
  await db
    .prepare(
      `INSERT INTO ideas (id, user_id, title, description, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .bind(id, user.id, value.title, value.description, nowIso())
    .run();

  return json(
    {
      ok: true,
      id,
      message: "Thank you. Your idea is with the founder for review and appears here once approved.",
    },
    201
  );
}
