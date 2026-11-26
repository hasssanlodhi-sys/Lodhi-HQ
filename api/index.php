<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/repository.php';
require __DIR__ . '/lib/load_integrations.php';

try {
    start_session();
    dispatch();
} catch (ConfigException $e) {
    json_error(500, $e->getMessage());
} catch (HttpException $e) {
    json_error($e->status, $e->getMessage());
} catch (Throwable $e) {
    error_log('[lodhi-hq] ' . $e->getMessage());
    json_error(500, 'Something went wrong.');
}

function dispatch(): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $path = request_path();

    if ($method === 'GET' && ($path === '/' || $path === '/health')) {
        json_ok(['ok' => true, 'service' => 'lodhi-hq', 'installed' => installed_quietly()]);
    }

    ensure_installed();

    if (!in_array($method, ['GET', 'HEAD'], true)) {
        assert_same_origin();
        require_csrf();
    }

    if ($method === 'GET' && $path === '/me') {
        $user = current_user();
        json_ok(['user' => $user ? session_json($user) : null, 'csrfToken' => csrf_token()]);
    }
    if ($method === 'POST' && $path === '/login') {
        handle_login();
    }
    if ($method === 'POST' && $path === '/logout') {
        handle_logout();
    }
    if ($method === 'GET' && $path === '/state') {
        json_ok(state_payload(require_user()));
    }
    if ($method === 'GET' && $path === '/completions') {
        require_user();
        $from = parse_required_instant((string) ($_GET['from'] ?? ''));
        $to = parse_required_instant((string) ($_GET['to'] ?? ''));
        json_ok(['rows' => completions_between($from, $to)]);
    }
    if ($method === 'POST' && $path === '/account/password') {
        handle_password();
    }
    if ($method === 'POST' && $path === '/reset') {
        json_ok(reset_board(require_user(), read_json()));
    }
    if ($method === 'POST' && $path === '/tasks') {
        handle_task_create();
    }
    if ($method === 'PUT' && preg_match('#^/tasks/([^/]+)$#', $path, $m)) {
        handle_task_update(rawurldecode($m[1]));
    }
    if ($method === 'DELETE' && preg_match('#^/tasks/([^/]+)$#', $path, $m)) {
        handle_task_delete(rawurldecode($m[1]));
    }
    if ($method === 'POST' && $path === '/checkins') {
        $user = require_user();
        require_owner($user);
        json_ok(['checkIn' => write_checkin(read_json())]);
    }
    if ($method === 'POST' && $path === '/rewards') {
        handle_reward_create();
    }
    if ($method === 'PUT' && preg_match('#^/rewards/([^/]+)$#', $path, $m)) {
        handle_reward_update(rawurldecode($m[1]));
    }
    if ($method === 'DELETE' && preg_match('#^/rewards/([^/]+)$#', $path, $m)) {
        handle_reward_delete(rawurldecode($m[1]));
    }
    if ($method === 'POST' && $path === '/members') {
        handle_member_create();
    }
    if ($method === 'PUT' && preg_match('#^/members/([^/]+)$#', $path, $m)) {
        handle_member_update(rawurldecode($m[1]));
    }
    if ($method === 'POST' && preg_match('#^/members/([^/]+)/active$#', $path, $m)) {
        handle_member_active(rawurldecode($m[1]));
    }
    if (integrations_try($method, $path)) {
        return;
    }

    throw new HttpException(404, 'Not found.');
}

function handle_login(): void
{
    $body = read_json();
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');
    if ($email === '' || $password === '' || strlen($password) > 200) {
        throw new HttpException(400, 'Enter your email and password.');
    }
    $ip = client_ip();
    assert_login_allowed($ip, $email);
    $user = find_user_by_email($email);
    $hash = $user['password_hash'] ?? DUMMY_PASSWORD_HASH;
    $ok = password_verify($password, $hash);
    if (!$user || !$ok) {
        record_login_failure($ip, $email);
        usleep(200000);
        throw new HttpException(401, 'Email or password is incorrect.');
    }
    if ((int) $user['active'] !== 1) {
        record_login_failure($ip, $email);
        usleep(200000);
        throw new HttpException(403, 'This account is deactivated. Ask the owner to turn it back on.');
    }
    clear_login_failures($ip, $email);
    if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    login_session($user);
    $fresh = find_user($user['id']) ?? $user;
    json_ok(['user' => session_json($fresh), 'csrfToken' => csrf_token()]);
}

function handle_logout(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => (bool) $params['secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    json_ok(['ok' => true]);
}

function handle_password(): void
{
    $user = require_user(true);
    $body = read_json();
    $current = (string) ($body['currentPassword'] ?? '');
    $next = (string) ($body['newPassword'] ?? '');
    if ($current === '' || $next === '') {
        throw new HttpException(400, 'Enter your current password and a new one.');
    }
    if (strlen($next) < 8 || strlen($next) > 200) {
        throw new HttpException(400, 'New password must be 8 to 200 characters.');
    }
    if ($next === $current) {
        throw new HttpException(400, 'Choose a different password.');
    }
    if (!password_verify($current, $user['password_hash'])) {
        throw new HttpException(400, 'Current password is incorrect.');
    }
    q(
        'UPDATE users SET password_hash = ?, must_change_password = 0, session_version = session_version + 1, updated_at = ? WHERE id = ?',
        [password_hash($next, PASSWORD_DEFAULT), mysql_now(), $user['id']]
    );
    $fresh = find_user($user['id']);
    if (!$fresh) {
        throw new HttpException(500, 'Something went wrong.');
    }
    login_session($fresh);
    json_ok(['user' => session_json($fresh), 'csrfToken' => csrf_token()]);
}

function handle_task_create(): void
{
    $user = require_user();
    $task = normalize_task(read_json(), null);
    if (!can_see_assignment($user, $task['assigneeId'], $task['tag'])) {
        throw new HttpException(403, 'You can only add tasks assigned to you or in a business the owner shared with you.');
    }
    assert_people_exist($task);
    insert_task($task);
    $row = task_by_id($task['id']);
    if (!$row) {
        throw new HttpException(500, 'Something went wrong.');
    }
    json_ok(['task' => task_json($row)]);
}

function handle_task_update(string $id): void
{
    $user = require_user();
    if (!valid_id($id)) {
        throw new HttpException(400, 'Task id is invalid.');
    }
    $existing = task_by_id($id);
    if (!$existing || !can_see_row($user, $existing)) {
        throw new HttpException(404, 'Task not found.');
    }
    $task = normalize_task(read_json(), $id);
    if (!can_see_assignment($user, $task['assigneeId'], $task['tag'])) {
        throw new HttpException(403, 'You can only keep tasks assigned to you or in a business the owner shared with you.');
    }
    assert_people_exist($task);
    update_task($task);
    $row = task_by_id($id);
    if (!$row) {
        throw new HttpException(500, 'Something went wrong.');
    }
    $payload = ['task' => task_json($row)];
    if ($existing['status'] !== 'Done' && $row['status'] === 'Done') {
        $warning = integration_push_done($row);
        if ($warning) {
            $payload['syncWarning'] = $warning;
        }
    }
    json_ok($payload);
}

function handle_task_delete(string $id): void
{
    $user = require_user();
    if (!valid_id($id)) {
        throw new HttpException(400, 'Task id is invalid.');
    }
    $existing = task_by_id($id);
    if (!$existing || !can_see_row($user, $existing)) {
        throw new HttpException(404, 'Task not found.');
    }
    q('DELETE FROM tasks WHERE id = ?', [$id]);
    json_ok(['ok' => true]);
}

function handle_reward_create(): void
{
    $user = require_user();
    require_owner($user);
    $reward = normalize_reward(read_json(), null);
    insert_reward($reward);
    $row = q('SELECT * FROM rewards WHERE id = ?', [$reward['id']])->fetch();
    json_ok(['reward' => reward_json($row)]);
}

function handle_reward_update(string $id): void
{
    $user = require_user();
    require_owner($user);
    if (!valid_id($id)) {
        throw new HttpException(400, 'Reward id is invalid.');
    }
    $existing = q('SELECT id FROM rewards WHERE id = ?', [$id])->fetch();
    if (!$existing) {
        throw new HttpException(404, 'Reward not found.');
    }
    $reward = normalize_reward(read_json(), $id);
    q(
        'UPDATE rewards SET title = ?, points = ?, claimed = ? WHERE id = ?',
        [$reward['title'], $reward['points'], $reward['claimed'], $id]
    );
    $row = q('SELECT * FROM rewards WHERE id = ?', [$id])->fetch();
    json_ok(['reward' => reward_json($row)]);
}

function handle_reward_delete(string $id): void
{
    $user = require_user();
    require_owner($user);
    if (!valid_id($id)) {
        throw new HttpException(400, 'Reward id is invalid.');
    }
    $existing = q('SELECT id FROM rewards WHERE id = ?', [$id])->fetch();
    if (!$existing) {
        throw new HttpException(404, 'Reward not found.');
    }
    q('DELETE FROM rewards WHERE id = ?', [$id]);
    json_ok(['ok' => true]);
}

function member_payload(array $actor, array $row): array
{
    $payload = ['member' => member_json($row, true)];
    if ($row['id'] === $actor['id']) {
        $payload['user'] = session_json($row);
    }
    return $payload;
}

function handle_member_create(): void
{
    $actor = require_user();
    require_owner($actor);
    $fields = normalize_member_fields(read_json(), null, true);
    if (find_user($fields['id'])) {
        throw new HttpException(409, 'That account id already exists.');
    }
    insert_staff($fields, password_hash((string) $fields['password'], PASSWORD_DEFAULT), 1);
    $row = find_user($fields['id']);
    if (!$row) {
        throw new HttpException(500, 'Something went wrong.');
    }
    json_ok(member_payload($actor, $row));
}

function handle_member_update(string $id): void
{
    $actor = require_user();
    require_owner($actor);
    if (!valid_id($id)) {
        throw new HttpException(400, 'Account id is invalid.');
    }
    $existing = find_user($id);
    if (!$existing) {
        throw new HttpException(404, 'Account not found.');
    }
    $fields = normalize_member_fields(read_json(), $id, false);
    if ($existing['account_role'] === 'owner' && $fields['password'] !== null) {
        throw new HttpException(400, 'Change your password from the account menu, which asks for the current one.');
    }
    q(
        'UPDATE users SET name = ?, job_title = ?, contact = ?, email = ?, business_tags = ?, updated_at = ? WHERE id = ?',
        [
            $fields['name'],
            $fields['role'],
            $fields['contact'],
            $fields['email'],
            json_encode($fields['tags'], JSON_UNESCAPED_UNICODE),
            mysql_now(),
            $id,
        ]
    );
    if ($fields['password'] !== null) {
        q(
            'UPDATE users SET password_hash = ?, must_change_password = 1, session_version = session_version + 1, updated_at = ? WHERE id = ?',
            [password_hash($fields['password'], PASSWORD_DEFAULT), mysql_now(), $id]
        );
    }
    $row = find_user($id);
    if (!$row) {
        throw new HttpException(500, 'Something went wrong.');
    }
    json_ok(member_payload($actor, $row));
}

function handle_member_active(string $id): void
{
    $actor = require_user();
    require_owner($actor);
    if (!valid_id($id)) {
        throw new HttpException(400, 'Account id is invalid.');
    }
    if ($id === OWNER_ID || $id === $actor['id']) {
        throw new HttpException(400, 'The owner account stays active.');
    }
    $existing = find_user($id);
    if (!$existing || $existing['account_role'] === 'owner') {
        throw new HttpException(404, 'Account not found.');
    }
    $active = bool_value(read_json()['active'] ?? false) ? 1 : 0;
    q(
        'UPDATE users SET active = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?',
        [$active, mysql_now(), $id]
    );
    $row = find_user($id);
    if (!$row) {
        throw new HttpException(500, 'Something went wrong.');
    }
    json_ok(member_payload($actor, $row));
}
