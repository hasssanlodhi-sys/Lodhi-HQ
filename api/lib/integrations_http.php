<?php

declare(strict_types=1);

function integrations_try(string $method, string $path): bool
{
    try {
        return integrations_dispatch($method, $path);
    } catch (HttpException $e) {
        throw $e;
    } catch (Throwable $e) {
        throw new HttpException(400, sync_public_error($e));
    }
}

function integrations_dispatch(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/integrations') {
        json_ok(integrations_index(require_user()));
    }
    if ($method === 'PUT' && preg_match('#^/integrations/(clickup|gcal|pos|reminders)$#', $path, $m)) {
        json_ok(integrations_save(require_user(), $m[1], read_json()));
    }
    if ($method === 'POST' && $path === '/integrations/sync') {
        $user = require_user();
        require_owner($user);
        $provider = trim((string) (read_json()['provider'] ?? ''));
        json_ok(sync_all($provider === '' ? null : $provider, true));
    }
    if ($method === 'POST' && $path === '/integrations/clickup/discover') {
        json_ok(clickup_discover(require_user(), read_json()));
    }
    if ($method === 'POST' && $path === '/integrations/pos/discover') {
        json_ok(pos_discover(require_user()));
    }
    if ($method === 'POST' && $path === '/integrations/reminders/discover') {
        json_ok(reminders_discover(require_user()));
    }
    if ($method === 'GET' && $path === '/migrations') {
        require_owner(require_user());
        json_ok(migrations_status());
    }
    if ($method === 'POST' && $path === '/migrations/run') {
        require_owner(require_user());
        $ran = run_migrations();
        json_ok(['appliedNow' => $ran, 'status' => migrations_status()]);
    }
    return false;
}
