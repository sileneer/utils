-- Keep legacy conversations columns intact for image rollback compatibility.
CREATE TABLE conversation_meta (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  title TEXT,
  archived_at INTEGER
);
CREATE INDEX conversations_history ON conversations(owner_user_id,updated_at DESC,id DESC);
CREATE INDEX usage_owner_day ON ai_usage(user_id,created_at);
CREATE INDEX usage_turn ON ai_usage(turn_id,user_id,created_at);
