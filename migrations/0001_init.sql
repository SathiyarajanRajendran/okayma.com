-- Okayma community ideas board — initial schema.

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,      -- stored lowercased
  phone             TEXT NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  title             TEXT NOT NULL,             -- professional title
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|active|suspended
  email_verified_at TEXT,
  created_at        TEXT NOT NULL,
  last_login_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);

-- Single-use links for email verification and passwordless sign-in.
-- Only the SHA-256 hash of the token is stored; the raw token lives in the
-- emailed URL and nowhere else.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  purpose    TEXT NOT NULL,                    -- verify|login
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

-- Session ids are also stored hashed, so a database leak cannot be replayed
-- as a live session.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,                             -- NULL for the admin session
  kind       TEXT NOT NULL,                    -- user|admin
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ideas (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,                   -- ~75 words
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  created_at  TEXT NOT NULL,
  decided_at  TEXT,
  admin_note  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ideas_status  ON ideas(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_user    ON ideas(user_id);

-- Coarse rate limiting for the public endpoints.
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
