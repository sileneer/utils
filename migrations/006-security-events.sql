-- Confirmed security changes, one short desensitized row per event.
-- `kind` is closed by CHECK so nothing outside the agreed vocabulary can be written.
-- The device columns hold the same two inferred labels the session list already
-- displays, never the raw User-Agent; no password, code, token, cookie, address,
-- IP or message content has a column here at all.
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('password_change','email_change','session_revoke_one','session_revoke_others','two_factor_enable','two_factor_disable','two_factor_recovery_codes_regenerated','passkey_register','passkey_remove')),
  occurred_at INTEGER NOT NULL,
  browser TEXT,
  system TEXT,
  masked_email TEXT,
  sessions_affected INTEGER
);
CREATE INDEX security_events_owner_recent ON security_events(user_id, occurred_at DESC);
