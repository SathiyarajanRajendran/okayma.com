-- Testimonials (a public feedback system with admin moderation) and the
-- delivery stages an approved idea moves through.

-- Testimonials -------------------------------------------------------------
--
-- Anyone may submit; nothing reaches the moderation queue until the address
-- has been confirmed. Without that, a submission could sign a stranger's name
-- and job title to words they never wrote, and the page whose whole purpose is
-- proof would be the easiest thing on the site to forge.
--
-- The confirmation token lives here rather than in `tokens`, because that
-- table's user_id is NOT NULL against `users` and a testimonial author is
-- deliberately not an account. Only the SHA-256 hash is stored, matching how
-- sessions and sign-in links are handled.
CREATE TABLE IF NOT EXISTS testimonials (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT '',   -- job title
  organisation       TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL,              -- private: never published
  relationship       TEXT NOT NULL DEFAULT '',   -- how they know the work
  body               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'unconfirmed',
                     -- unconfirmed|pending|published|rejected
  confirm_hash       TEXT,
  confirm_expires_at TEXT,
  confirmed_at       TEXT,
  created_at         TEXT NOT NULL,
  decided_at         TEXT,
  admin_note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status
  ON testimonials(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_testimonials_confirm
  ON testimonials(confirm_hash);
CREATE INDEX IF NOT EXISTS idx_testimonials_email
  ON testimonials(email);

-- Idea stages --------------------------------------------------------------
--
-- Stage is orthogonal to moderation status: `status` decides whether an idea
-- is publicly visible at all, `stage` says how far it has travelled once it
-- is. A rejected idea still carries whatever stage it had.
--
-- The keys are mirrored in lib/stages.js, which is the single place that
-- defines their order and labels. Nothing here constrains the value to that
-- list, so a future stage needs no migration.
ALTER TABLE ideas ADD COLUMN stage TEXT NOT NULL DEFAULT 'ideation';
ALTER TABLE ideas ADD COLUMN stage_changed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_ideas_stage ON ideas(stage, created_at DESC);

-- Every move is recorded, so the dashboard can show how long an idea has sat
-- where it is rather than only where it currently sits.
CREATE TABLE IF NOT EXISTS idea_stage_events (
  id         TEXT PRIMARY KEY,
  idea_id    TEXT NOT NULL,
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_events_idea
  ON idea_stage_events(idea_id, created_at DESC);

-- Seed ---------------------------------------------------------------------
--
-- Kumar's testimonial was hard-coded into testimonials.html. The page is now
-- rendered from this table, so it moves here to avoid the same words living in
-- two places and drifting apart. Fixed id keeps this safe to re-run.
INSERT OR IGNORE INTO testimonials
  (id, name, role, organisation, email, relationship, body, status,
   confirmed_at, created_at, decided_at)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  'Saravanakumar Sakthivel',
  'Technical Director',
  'SoftTeam Solutions Pvt. Ltd.',
  '',
  'Worked together on an e-commerce platform for small businesses during the pandemic, with Sathiya as Solution Architect.',
  'I have had the unique privilege of knowing Sathiya in two capacities — as my junior at college, and as a trusted technology collaborator.

During the height of the pandemic, we teamed up to build an e-commerce platform to keep small businesses trading through an extremely difficult period. As Solution Architect, Sathiya was the backbone of that initiative. He began with the real business problem rather than the presenting symptoms, and turned it into a working product that reached users quickly. He does not just build software; he designs scalable, meaningful solutions to complex real-world problems. His technical foresight and his ability to architect under pressure were decisive in getting the platform live.

Above all his technical brilliance, what truly sets him apart is that he is an outstanding human being. He brings empathy, integrity and deep dedication to everything he touches. That is why I am glad to put my name behind Okayma.com. If you have a business problem worth solving, or an idea that answers one, Sathiya is the person I would take it to — he will meet it with calm, honest thinking, and he will elevate both the technology and the people around it.',
  'published',
  '2026-09-17T00:00:00.000Z',
  '2026-09-17T00:00:00.000Z',
  '2026-09-17T00:00:00.000Z'
);
