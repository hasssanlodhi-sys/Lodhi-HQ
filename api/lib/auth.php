<?php

declare(strict_types=1);

function find_user(string $id): ?array
{
    $row = q('SELECT * FROM users WHERE id = ?', [$id])->fetch();
    return $row ?: null;
}

function find_user_by_email(string $email): ?array
{
    $row = q('SELECT * FROM users WHERE email = ?', [$email])->fetch();
    return $row ?: null;
}

function user_tags(array $user): array
{
    $tags = json_decode((string) $user['business_tags'], true);
    if (!is_array($tags)) {
        return [];
    }
    $clean = [];
    foreach ($tags as $tag) {
        if (is_string($tag)) {
            $clean[] = $tag;
        }
    }
    return $clean;
}

function session_json(array $row): array
{
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'owner' => $row['account_role'] === 'owner',
        'businessTags' => user_tags($row),
        'mustChangePassword' => (int) $row['must_change_password'] === 1,
    ];
}

function member_json(array $row, bool $includeEmail): array
{
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'role' => $row['job_title'],
        'businessTags' => user_tags($row),
        'contact' => $row['contact'],
        'owner' => $row['account_role'] === 'owner',
        'email' => $includeEmail ? $row['email'] : '',
        'active' => (int) $row['active'] === 1,
    ];
}

function wipe_auth_session(): void
{
    unset($_SESSION['user_id'], $_SESSION['session_version']);
}

function login_session(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['session_version'] = (int) $user['session_version'];
    rotate_csrf();
}

function current_user(): ?array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!is_string($id) || $id === '') {
        return null;
    }
    try {
        $user = find_user($id);
    } catch (PDOException $e) {
        error_log('[lodhi-hq] session user lookup failed');
        return null;
    }
    if (!$user || (int) $user['active'] !== 1) {
        wipe_auth_session();
        return null;
    }
    if ((int) ($_SESSION['session_version'] ?? -1) !== (int) $user['session_version']) {
        wipe_auth_session();
        return null;
    }
    return $user;
}

function require_user(bool $allowPendingPassword = false): array
{
    $user = current_user();
    if (!$user) {
        throw new HttpException(401, 'Sign in required.');
    }
    if ((int) $user['must_change_password'] === 1 && !$allowPendingPassword) {
        throw new HttpException(403, 'Change your temporary password before continuing.');
    }
    return $user;
}

function require_owner(array $user): void
{
    if ($user['account_role'] !== 'owner') {
        throw new HttpException(403, 'Only the owner can do that.');
    }
}

function assert_login_allowed(string $ip, string $email): void
{
    $since = (new DateTimeImmutable('-15 minutes', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    $byPair = (int) q(
        'SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND email = ? AND attempted_at >= ?',
        [$ip, $email, $since]
    )->fetchColumn();
    $byIp = (int) q(
        'SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND attempted_at >= ?',
        [$ip, $since]
    )->fetchColumn();
    if ($byPair >= 8 || $byIp >= 100) {
        header('Retry-After: 900');
        throw new HttpException(429, 'Too many sign-in attempts. Wait a few minutes and try again.');
    }
}

function record_login_failure(string $ip, string $email): void
{
    q(
        'INSERT INTO login_attempts (ip, email, attempted_at) VALUES (?, ?, ?)',
        [$ip, $email, mysql_now_seconds()]
    );
    if (random_int(1, 25) === 1) {
        $old = (new DateTimeImmutable('-2 days', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
        q('DELETE FROM login_attempts WHERE attempted_at < ?', [$old]);
    }
}

function clear_login_failures(string $ip, string $email): void
{
    q('DELETE FROM login_attempts WHERE ip = ? AND email = ?', [$ip, $email]);
}

function installed_quietly(): bool
{
    try {
        $value = q('SELECT `value` FROM settings WHERE name = ?', ['installed'])->fetchColumn();
        return $value === '1';
    } catch (ConfigException $e) {
        throw $e;
    } catch (Throwable) {
        return false;
    }
}

function ensure_installed(): void
{
    if (!installed_quietly()) {
        throw new HttpException(503, 'Lodhi HQ is not installed yet. Open /api/setup.php to create the owner account.');
    }
}

function setting(string $name): ?string
{
    $value = q('SELECT `value` FROM settings WHERE name = ?', [$name])->fetchColumn();
    return $value === false ? null : (string) $value;
}

function set_setting(string $name, string $value): void
{
    $existing = q('SELECT name FROM settings WHERE name = ?', [$name])->fetch();
    if ($existing) {
        q('UPDATE settings SET `value` = ? WHERE name = ?', [$value, $name]);
        return;
    }
    q('INSERT INTO settings (name, `value`) VALUES (?, ?)', [$name, $value]);
}
