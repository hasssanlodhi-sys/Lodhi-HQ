<?php

declare(strict_types=1);

function migrations_dir(): string
{
    return dirname(__DIR__) . '/migrations';
}

function migration_files(): array
{
    $files = glob(migrations_dir() . '/*.sql') ?: [];
    sort($files, SORT_STRING);
    return $files;
}

function ensure_schema_migrations(): void
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (
            filename VARCHAR(190) NOT NULL,
            applied_at DATETIME(3) NOT NULL,
            PRIMARY KEY (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function migrations_status(): array
{
    ensure_schema_migrations();
    $applied = q('SELECT filename FROM schema_migrations ORDER BY filename')->fetchAll(PDO::FETCH_COLUMN);
    if (!is_array($applied)) {
        $applied = [];
    }
    $applied = array_map('strval', $applied);
    $pending = [];
    foreach (migration_files() as $file) {
        $name = basename($file);
        if (!in_array($name, $applied, true)) {
            $pending[] = $name;
        }
    }
    return ['applied' => array_values($applied), 'pending' => $pending];
}

function run_migrations(): array
{
    $status = migrations_status();
    $ran = [];
    foreach ($status['pending'] as $name) {
        if (!preg_match('/^[A-Za-z0-9._-]+\.sql$/', $name)) {
            throw new RuntimeException('Migration name is invalid.');
        }
        $path = migrations_dir() . '/' . $name;
        if (!is_file($path)) {
            throw new RuntimeException('Migration file is missing: ' . $name);
        }
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException('Could not read ' . $name);
        }
        try {
            run_sql_script($sql);
            q('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)', [$name, mysql_now()]);
        } catch (Throwable $e) {
            error_log('[lodhi-hq] migration ' . $name . ' failed: ' . $e->getMessage());
            throw new RuntimeException('Migration ' . $name . ' failed. ' . $e->getMessage());
        }
        $ran[] = $name;
    }
    return $ran;
}
