-- Lodestar Authentication Schema & User Seed Script
-- Keep user schema and queries separate for adding more users later

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Example template for adding more users later via SQL:
-- INSERT OR IGNORE INTO users (id, username, password_hash, salt, role, name, email, created_at, updated_at)
-- VALUES ('usr_analyst_01', 'analyst', '<hash>', '<salt>', 'analyst', 'Sarah Chen', 'analyst@lodestar.local', strftime('%s','now') * 1000, strftime('%s','now') * 1000);
-- INSERT OR IGNORE INTO users (id, username, password_hash, salt, role, name, email, created_at, updated_at)
-- VALUES ('usr_lead_01', 'lead', '<hash>', '<salt>', 'lead', 'Alex Chen', 'lead@lodestar.local', strftime('%s','now') * 1000, strftime('%s','now') * 1000);
