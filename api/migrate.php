<?php

declare(strict_types=1);

/**
 * Apply api/migrations/*.sql. The installer does not run again after setup,
 * so existing Hostinger installs use this command:
 *   php /home/USER/domains/DOMAIN/public_html/api/migrate.php
 *
 * The owner can also run the same files from the Integrations screen.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo "Run migrations from the command line, or from the Integrations screen while signed in as the owner.\n";
    exit;
}

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/repository.php';
require __DIR__ . '/lib/load_integrations.php';

try {
    $ran = run_migrations();
    $status = migrations_status();
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

if ($ran === []) {
    echo "Migrations are up to date.\n";
    exit(0);
}
echo 'Applied ' . implode(', ', $ran) . "\n";
if ($status['pending'] !== []) {
    echo 'Still pending: ' . implode(', ', $status['pending']) . "\n";
    exit(1);
}
exit(0);
