-- Account-level presentation preferences (batch B). One optional row per user;
-- a NULL column means "no account choice", so the device layer stays in effect.
-- Presentation only: role/status/verified remain server-only columns on `user`.
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  theme TEXT CHECK (theme IN ('system','light','dark')),
  language TEXT CHECK (language IN ('en','zh')),
  updated_at INTEGER NOT NULL
);
