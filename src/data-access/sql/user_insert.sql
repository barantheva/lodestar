-- Lodestar User Initialisation SQL Script
-- Default users: admin/admin and developer/developer

-- 1. Administrator (Username: admin / Password: admin)
INSERT OR IGNORE INTO users (
  id,
  username,
  password_hash,
  salt,
  role,
  name,
  email,
  created_at,
  updated_at
) VALUES (
  'usr_admin_default',
  'admin',
  'e8122a7b2dd6ad8d99b8c869757265ca45fdfb6da66cf5086845da9f950448e9',
  'lodestar_admin_salt',
  'admin',
  'Administrator',
  'admin@lodestar.local',
  1772841600000,
  1772841600000
);

-- 2. Developer (Username: developer / Password: developer)
INSERT OR IGNORE INTO users (
  id,
  username,
  password_hash,
  salt,
  role,
  name,
  email,
  created_at,
  updated_at
) VALUES (
  'usr_developer_01',
  'developer',
  '7a63f694d20a338189d012cef7dd16a08998dfddcb5624f0658b13080a43e95d',
  'lodestar_developer_salt',
  'developer',
  'Lodestar Developer',
  'developer@lodestar.local',
  1772841600000,
  1772841600000
);
