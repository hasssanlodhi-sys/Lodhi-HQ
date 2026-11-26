<?php

declare(strict_types=1);

/**
 * Router for the PHP built-in server only:
 *   php -S 127.0.0.1:8080 -t . scripts/php-router.php
 * Apache and LiteSpeed on Hostinger use the .htaccess files instead.
 */

$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
if (str_contains($uri, '..')) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Bad request';
    return true;
}

$blocked = preg_match('#^/api/(config\.php|config\.example\.php|schema\.sql|setup\.lock)$#', $uri) === 1
    || preg_match('#^/api/lib(/|$)#', $uri) === 1
    || preg_match('#^/api/.*\.(lock|sql)$#', $uri) === 1;
if ($blocked) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo 'Forbidden';
    return true;
}

if (str_starts_with($uri, '/api/')) {
    $rel = substr($uri, strlen('/api/'));
    $file = dirname(__DIR__) . '/api/' . $rel;
    if ($rel !== '' && is_file($file)) {
        return false;
    }
    require dirname(__DIR__) . '/api/index.php';
    return true;
}

return false;
