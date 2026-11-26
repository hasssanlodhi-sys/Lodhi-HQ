<?php

declare(strict_types=1);

const OWNER_ID = 'muhammad';
const DEMO_STAFF_PASSWORD = 'Lodhi-demo-1';
const TAGS = ['cell-phone', 'essentials', 'tax', 'hustler', 'telconnect', 'personal'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const STATUSES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const DUMMY_PASSWORD_HASH = '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('UTC');
if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

class HttpException extends RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

class ConfigException extends RuntimeException
{
}

function app_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }
    $path = dirname(__DIR__) . '/config.php';
    if (!is_file($path)) {
        throw new ConfigException('Missing api/config.php. Copy api/config.example.php to api/config.php and fill in the database.');
    }
    $loaded = require $path;
    if (!is_array($loaded) || !isset($loaded['db']) || !is_array($loaded['db'])) {
        throw new ConfigException('api/config.php must return an array with a db section.');
    }
    foreach (['host', 'name', 'user'] as $key) {
        if (!isset($loaded['db'][$key]) || !is_string($loaded['db'][$key]) || $loaded['db'][$key] === '') {
            throw new ConfigException('api/config.php is missing db.' . $key . '.');
        }
    }
    if (!isset($loaded['db']['pass']) || !is_string($loaded['db']['pass'])) {
        throw new ConfigException('api/config.php is missing db.pass.');
    }
    $config = $loaded;
    return $config;
}

function cookie_secure(array $config): bool
{
    $setting = $config['cookie_secure'] ?? null;
    if ($setting === true || $setting === 1 || $setting === '1') {
        return true;
    }
    if ($setting === false || $setting === 0 || $setting === '0') {
        return false;
    }
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = cookie_secure(app_config());
    $lifetime = 60 * 60 * 12;
    session_name('lodhi_hq');
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    if ($secure) {
        ini_set('session.cookie_secure', '1');
    }
    if (!session_start()) {
        throw new RuntimeException('Could not start the session.');
    }
}

function db(): PDO
{
    if (isset($GLOBALS['lodhi_test_pdo']) && $GLOBALS['lodhi_test_pdo'] instanceof PDO) {
        return $GLOBALS['lodhi_test_pdo'];
    }
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $config = app_config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $config['host'],
        (int) ($config['port'] ?? 3306),
        $config['name'],
        is_string($config['charset'] ?? null) && $config['charset'] !== '' ? $config['charset'] : 'utf8mb4'
    );
    try {
        $pdo = new PDO($dsn, $config['user'], $config['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[lodhi-hq] database connection failed: ' . $e->getMessage());
        throw new ConfigException('Could not connect to the database. Check the host, name, user, and password in api/config.php.');
    }
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function run_sql_script(string $sql): void
{
    $stripped = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $parts = preg_split('/;\s*(?:\r?\n|$)/', $stripped) ?: [];
    foreach ($parts as $statement) {
        $statement = trim($statement);
        if ($statement === '') {
            continue;
        }
        db()->exec($statement);
    }
}

function json_out(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_ok(array $payload): never
{
    json_out(200, $payload);
}

function json_error(int $status, string $message): never
{
    json_out($status, ['error' => $message]);
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function rotate_csrf(): string
{
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function csrf_matches(string $sent): bool
{
    $stored = $_SESSION['csrf'] ?? '';
    return is_string($stored) && $stored !== '' && $sent !== '' && hash_equals($stored, $sent);
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || !csrf_matches($sent)) {
        throw new HttpException(403, 'Invalid CSRF token.');
    }
}

function assert_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!is_string($origin) || $origin === '') {
        return;
    }
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (!is_string($host) || $host === '' || preg_match('/[\s\/\\\\]/', $host) === 1) {
        throw new HttpException(403, 'Cross-origin request blocked.');
    }
    if ($origin !== 'https://' . $host && $origin !== 'http://' . $host) {
        throw new HttpException(403, 'Cross-origin request blocked.');
    }
}

function read_json(): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 2_000_000) {
        throw new HttpException(413, 'Request is too large.');
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || array_is_list($data)) {
        throw new HttpException(400, 'Expected a JSON object.');
    }
    return $data;
}

function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!is_string($ip) || $ip === '' || strlen($ip) > 64) {
        return '0.0.0.0';
    }
    return $ip;
}

function mysql_now(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
}

function mysql_now_seconds(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
}

function iso_from_mysql(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $dt = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    return $dt->format('Y-m-d\TH:i:s.v\Z');
}

function parse_optional_iso(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value)) {
        throw new HttpException(400, 'A date field is invalid.');
    }
    try {
        $dt = new DateTimeImmutable($value);
    } catch (Exception) {
        throw new HttpException(400, 'A date field is invalid.');
    }
    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
}

function parse_required_instant(string $value): DateTimeImmutable
{
    if ($value === '') {
        throw new HttpException(400, 'Missing date range.');
    }
    try {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'));
    } catch (Exception) {
        throw new HttpException(400, 'Date range is invalid.');
    }
}

function valid_id(string $id): bool
{
    return preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $id) === 1;
}

function valid_email(string $email): bool
{
    if ($email === '' || strlen($email) > 255) {
        return false;
    }
    return preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $email) === 1;
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function bool_value(mixed $value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value)) {
        return $value === 1;
    }
    if (is_string($value)) {
        return $value === '1' || strtolower($value) === 'true';
    }
    return false;
}

function int_value(mixed $value): int|false
{
    if (is_int($value)) {
        return $value;
    }
    if (is_float($value) && $value == (int) $value) {
        return (int) $value;
    }
    if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
        return (int) $value;
    }
    return false;
}

function normalize_tags(mixed $tags): array
{
    if (!is_array($tags)) {
        throw new HttpException(400, 'Business tags must be a list.');
    }
    $clean = [];
    foreach ($tags as $tag) {
        if (!is_string($tag) || !in_array($tag, TAGS, true)) {
            throw new HttpException(400, 'Unknown business tag.');
        }
        if (!in_array($tag, $clean, true)) {
            $clean[] = $tag;
        }
    }
    return $clean;
}

function request_path(): string
{
    $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
    if (str_contains($uri, '..')) {
        throw new HttpException(400, 'Bad request.');
    }
    $path = preg_replace('#^/api#', '', $uri) ?? $uri;
    $path = '/' . trim((string) $path, '/');
    return $path === '/' ? '/' : $path;
}
