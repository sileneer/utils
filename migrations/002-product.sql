CREATE TABLE limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mail_requests (
  id TEXT PRIMARY KEY, email_hash TEXT NOT NULL, purpose TEXT NOT NULL,
  created_at INTEGER NOT NULL, status TEXT NOT NULL, provider_id TEXT
);
CREATE INDEX mail_day ON mail_requests(created_at);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES user(id),
  revision TEXT, sdk_session_id TEXT, needs_rebuild INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_owner ON conversations(owner_user_id);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, turn_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL, error TEXT,
  revision TEXT, context_json TEXT
);
CREATE INDEX messages_conversation ON messages(conversation_id, position);
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), turn_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, status TEXT NOT NULL, usage_json TEXT
);
CREATE INDEX usage_day ON ai_usage(created_at, user_id);
