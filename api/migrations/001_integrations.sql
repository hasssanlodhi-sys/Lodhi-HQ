-- Integration credentials and sync status. Safe to run more than once.
-- setup.php does not re-run on an existing install; apply this from
-- api/migrate.php or the owner's Integrations screen.

CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  settings JSON NOT NULL,
  secret_blob TEXT NULL,
  last_sync_at DATETIME(3) NULL,
  last_error VARCHAR(2000) NULL,
  last_summary VARCHAR(500) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integrations_provider_user (provider, user_id),
  CONSTRAINT fk_integrations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(190) NOT NULL,
  applied_at DATETIME(3) NOT NULL,
  PRIMARY KEY (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
