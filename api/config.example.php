<?php

declare(strict_types=1);

/**
 * Copy this file to config.php on the server and fill in the MySQL user from hPanel.
 * config.php is gitignored. api/.htaccess denies web access to both files.
 *
 * Hostinger's database host is usually localhost. If a password contains a single
 * quote, escape it as \'.
 */
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'your_database_name',
        'user' => 'your_database_user',
        'pass' => 'your_database_password',
        'charset' => 'utf8mb4',
    ],
    // null: Secure cookie only when the request is HTTPS (use this on Hostinger).
    // false: leave the cookie usable on local http:// PHP.
    'cookie_secure' => null,
];
