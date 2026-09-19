import { json } from "../../../lib/http.js";
import { pruneExpired } from "../../../lib/auth.js";
import { STAGES } from "../../../lib/stages.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  await pruneExpired(db);

  const [users, ideas, testimonials, stages] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM users`
    ),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM ideas`
    ),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'unconfirmed' THEN 1 ELSE 0 END) AS unconfirmed,
         SUM(CASE WHEN status = 'pending'     THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'published'   THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'rejected'    THEN 1 ELSE 0 END) AS rejected
       FROM testimonials`
    ),
    // Stage counts cover approved ideas only: an idea awaiting moderation is
    // sitting at the default stage by accident rather than by decision, and
    // counting it would overstate what is actually in the pipeline.
    db.prepare(
      `SELECT stage, COUNT(*) AS n
         FROM ideas
        WHERE status = 'approved'
        GROUP BY stage`
    ),
  ]);

  const u = users.results[0] || {};
  const i = ideas.results[0] || {};
  const t = testimonials.results[0] || {};

  const counted = new Map(stages.results.map((row) => [row.stage, row.n]));
  const byStage = STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    pipeline: stage.pipeline,
    count: counted.get(stage.key) || 0,
  }));

  // Anything sitting at a stage key no longer in lib/stages.js would otherwise
  // vanish from the dashboard while still existing in the table.
  for (const [key, count] of counted) {
    if (!byStage.some((s) => s.key === key)) {
      byStage.push({ key, label: key, pipeline: false, count, unknown: true });
    }
  }

  return json({
    users: {
      total: u.total || 0,
      active: u.active || 0,
      pending: u.pending || 0,
      suspended: u.suspended || 0,
    },
    ideas: {
      total: i.total || 0,
      pending: i.pending || 0,
      approved: i.approved || 0,
      rejected: i.rejected || 0,
    },
    testimonials: {
      total: t.total || 0,
      unconfirmed: t.unconfirmed || 0,
      pending: t.pending || 0,
      published: t.published || 0,
      rejected: t.rejected || 0,
    },
    stages: byStage,
  });
}
