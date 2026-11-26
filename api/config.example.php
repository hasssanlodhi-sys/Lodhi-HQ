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
    // Encrypts ClickUp tokens, calendar addresses, Supabase keys, and Apple
    // app passwords. At least 16 characters. Generate one and do not change it
    // later, or saved credentials cannot be read:
    //   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
    'app_key' => '',
    // Optional. Leave empty and run sync from a Hostinger cron PHP command.
    // Set this only if you also want https://your-domain/api/cron-sync.php?token=...
    'cron_token' => '',
];
