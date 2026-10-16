-- Email-change transactions (C1). One row per request with its own uuid id, so a
-- code can never collide with a registration or password-reset OTP. Two independent
-- codes are issued — one to the address being retired, one to the target — and each
-- carries its own digest and attempt counter: neither side can borrow the other's
-- code. Plaintext codes are never stored. A partial unique index on new_email while
-- status='pending' makes "at most one live request per target address" a database
-- guarantee rather than a read-then-write check.
CREATE TABLE email_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  old_email_hash TEXT NOT NULL,
  new_email TEXT NOT NULL,
  old_code_digest TEXT NOT NULL,
  new_code_digest TEXT NOT NULL,
  old_attempts INTEGER NOT NULL DEFAULT 0,
  new_attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','cancelled','completed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX email_changes_pending_target ON email_changes(new_email) WHERE status='pending';
CREATE INDEX email_changes_user_pending ON email_changes(user_id, status, expires_at);
