-- Lodhi HQ tables. Applied once by api/setup.php.
-- Engine and charset match Hostinger MySQL 8 and MariaDB 10.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  job_title VARCHAR(120) NOT NULL DEFAULT '',
  account_role ENUM('owner', 'staff') NOT NULL DEFAULT 'staff',
  business_tags JSON NOT NULL,
  contact VARCHAR(255) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  tag VARCHAR(32) NOT NULL,
  deadline DATETIME(3) NULL,
  all_day TINYINT(1) NOT NULL DEFAULT 0,
  priority ENUM('Urgent', 'High', 'Medium', 'Low') NOT NULL,
  assignee_id VARCHAR(64) NOT NULL,
  status ENUM('To Do', 'In Progress', 'Waiting', 'Done') NOT NULL,
  estimated_time INT NOT NULL,
  notes TEXT NOT NULL,
  completed_at DATETIME(3) NULL,
  on_time TINYINT(1) NULL,
  recurrence ENUM('daily') NULL,
  helped_member_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tasks_assignee (assignee_id),
  KEY idx_tasks_tag (tag),
  KEY idx_tasks_status (status),
  KEY idx_tasks_deadline (deadline),
  KEY idx_tasks_completed (completed_at),
  KEY idx_tasks_helped (helped_member_id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id),
  CONSTRAINT fk_tasks_helped FOREIGN KEY (helped_member_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS check_ins (
  id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  woke_up_at CHAR(5) NOT NULL,
  gym_done TINYINT(1) NOT NULL,
  arrived_on_time TINYINT(1) NOT NULL,
  mood TINYINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checkins_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rewards (
  id VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  points INT NOT NULL,
  claimed TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_rewards_points (points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  attempted_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_login_attempts_pair (email, ip, attempted_at),
  KEY idx_login_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  name VARCHAR(64) NOT NULL,
  value VARCHAR(255) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
