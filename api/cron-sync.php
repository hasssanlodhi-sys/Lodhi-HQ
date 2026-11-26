<?php

declare(strict_types=1);

/**
 * Hostinger cron (preferred), every 15 minutes:
 *   php /home/USER/domains/DOMAIN/public_html/api/cron-sync.php
 *
 * The web server refuses this script unless config.php cron_token is set
 * and the request passes the same token as ?token= or X-Cron-Token.
 * A successful CLI run prints nothing.
 */

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/repository.php';
require __DIR__ . '/lib/load_integrations.php';

$isCli = PHP_SAPI === 'cli';

if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    try {
        $expected = app_config()['cron_token'] ?? '';
    } catch (Throwable $e) {
        http_response_code(500);
        echo "Sync is not configured.\n";
        exit;
    }
    $sent = $_GET['token'] ?? ($_SERVER['HTTP_X_CRON_TOKEN'] ?? '');
    if (!is_string($expected) || $expected === '' || !is_string($sent) || !hash_equals($expected, $sent)) {
        http_response_code(403);
        echo "Forbidden\n";
        exit;
    }
}

try {
    $payload = sync_all(null, false);
} catch (Throwable $e) {
    $message = sync_public_error($e);
    if ($isCli) {
        fwrite(STDERR, $message . "\n");
    } else {
        http_response_code(500);
        echo $message . "\n";
    }
    exit(1);
}

$failed = [];
foreach ($payload['results'] ?? [] as $provider => $result) {
    if (is_array($result) && array_key_exists('ok', $result) && $result['ok'] === false) {
        $failed[] = $provider . ': ' . (string) ($result['error'] ?? 'failed');
    }
}

if ($failed !== []) {
    $text = "Sync finished with errors\n" . implode("\n", $failed) . "\n";
    if ($isCli) {
        fwrite(STDERR, $text);
    } else {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit(1);
}

if (!$isCli) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
exit(0);
