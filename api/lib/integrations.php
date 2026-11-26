<?php

declare(strict_types=1);

function integrations_table_ready(): bool
{
    try {
        q('SELECT 1 FROM integrations LIMIT 1');
        return true;
    } catch (Throwable) {
        return false;
    }
}

function integration_settings(array $row): array
{
    $decoded = json_decode((string) ($row['settings'] ?? ''), true);
    return is_array($decoded) ? $decoded : [];
}

function integration_secrets(array $row): array
{
    $blob = $row['secret_blob'] ?? null;
    if (!is_string($blob) || $blob === '') {
        return [];
    }
    $json = secret_decrypt($blob);
    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : [];
}

function integration_by_id(string $id): ?array
{
    $row = q('SELECT * FROM integrations WHERE id = ?', [$id])->fetch();
    return $row ?: null;
}

function integration_by_provider_user(string $provider, string $userId): ?array
{
    $row = q('SELECT * FROM integrations WHERE provider = ? AND user_id = ?', [$provider, $userId])->fetch();
    return $row ?: null;
}

function integrations_for_provider(string $provider): array
{
    return q('SELECT * FROM integrations WHERE provider = ? ORDER BY user_id', [$provider])->fetchAll();
}

function integration_row_id(string $provider, string $userId): string
{
    if ($provider === 'clickup' || $provider === 'pos') {
        return $provider;
    }
    $id = $provider . '-' . $userId;
    if (!valid_id($id)) {
        $id = $provider . '-' . substr(hash('sha256', $userId), 0, 20);
    }
    return $id;
}

function integration_public(array $row, string $userName = ''): array
{
    $settings = integration_settings($row);
    unset($settings['appPassword'], $settings['token'], $settings['apiKey'], $settings['url']);
    return [
        'id' => $row['id'],
        'provider' => $row['provider'],
        'userId' => $row['user_id'],
        'userName' => $userName !== '' ? $userName : ($row['user_name'] ?? ''),
        'enabled' => (int) $row['enabled'] === 1,
        'configured' => is_string($row['secret_blob'] ?? null) && $row['secret_blob'] !== '',
        'settings' => $settings,
        'lastSyncAt' => iso_from_mysql($row['last_sync_at'] ?? null),
        'lastError' => $row['last_error'],
        'lastSummary' => $row['last_summary'],
        'updatedAt' => iso_from_mysql($row['updated_at'] ?? null),
    ];
}

function integrations_index(array $user): array
{
    $owner = $user['account_role'] === 'owner';
    if (!integrations_table_ready()) {
        return [
            'needsMigration' => true,
            'integrations' => [],
            'viewerId' => $user['id'],
            'owner' => $owner,
        ];
    }
    if ($owner) {
        $rows = q(
            'SELECT i.*, u.name AS user_name FROM integrations i JOIN users u ON u.id = i.user_id ORDER BY i.provider, u.name'
        )->fetchAll();
    } else {
        $rows = q(
            "SELECT i.*, u.name AS user_name FROM integrations i JOIN users u ON u.id = i.user_id
             WHERE i.user_id = ? AND i.provider IN ('gcal', 'reminders') ORDER BY i.provider",
            [$user['id']]
        )->fetchAll();
    }
    $out = [];
    foreach ($rows as $row) {
        $out[] = integration_public($row, (string) ($row['user_name'] ?? ''));
    }
    return [
        'needsMigration' => false,
        'integrations' => $out,
        'viewerId' => $user['id'],
        'owner' => $owner,
    ];
}

function integration_default_settings(string $provider): array
{
    return match ($provider) {
        'clickup' => [
            'teamId' => '',
            'spaceIds' => [],
            'tagMap' => [['match' => 'The Cellphone Store', 'tag' => 'cell-phone']],
            'defaultTag' => 'cell-phone',
        ],
        'gcal' => ['tag' => 'personal'],
        'pos' => [
            'url' => '',
            'includeRefurb' => false,
            'doneStatus' => 'done',
            'tables' => [
                'tasks' => pos_empty_columns(),
                'refurb_tasks' => pos_empty_columns(),
            ],
        ],
        'reminders' => [
            'tag' => 'personal',
            'appleId' => '',
            'listHrefs' => [],
            'foundLists' => [],
        ],
        default => [],
    };
}

function clean_column_map(mixed $input): array
{
    $base = pos_empty_columns();
    if (!is_array($input)) {
        return $base;
    }
    foreach ($base as $field => $unused) {
        $value = $input[$field] ?? null;
        if ($value === null || $value === '') {
            $base[$field] = null;
            continue;
        }
        if (!is_string($value) || !column_name_ok($value)) {
            throw new HttpException(400, 'A column name is invalid.');
        }
        $base[$field] = $value;
    }
    return $base;
}

function normalize_integration_settings(string $provider, array $input): array
{
    $settings = integration_default_settings($provider);
    if ($provider === 'clickup') {
        $team = trim((string) ($input['teamId'] ?? ''));
        if ($team !== '' && preg_match('/^[A-Za-z0-9]{1,32}$/', $team) !== 1) {
            throw new HttpException(400, 'ClickUp workspace id is invalid.');
        }
        $settings['teamId'] = $team;
        $spaces = [];
        foreach (is_array($input['spaceIds'] ?? null) ? $input['spaceIds'] : [] as $spaceId) {
            if (!is_string($spaceId) || preg_match('/^[A-Za-z0-9]{1,32}$/', $spaceId) !== 1) {
                continue;
            }
            if (!in_array($spaceId, $spaces, true)) {
                $spaces[] = $spaceId;
            }
            if (count($spaces) >= 40) {
                break;
            }
        }
        $settings['spaceIds'] = $spaces;
        $tagMap = [];
        foreach (is_array($input['tagMap'] ?? null) ? $input['tagMap'] : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $match = trim((string) ($row['match'] ?? ''));
            $tag = (string) ($row['tag'] ?? '');
            if ($match === '' || text_length($match) > 120 || !in_array($tag, TAGS, true)) {
                continue;
            }
            $tagMap[] = ['match' => $match, 'tag' => $tag];
            if (count($tagMap) >= 30) {
                break;
            }
        }
        if ($tagMap === []) {
            $tagMap = $settings['tagMap'];
        }
        $settings['tagMap'] = $tagMap;
        $default = (string) ($input['defaultTag'] ?? 'cell-phone');
        $settings['defaultTag'] = in_array($default, TAGS, true) ? $default : 'cell-phone';
    }
    if ($provider === 'gcal' || $provider === 'reminders') {
        $tag = (string) ($input['tag'] ?? 'personal');
        $settings['tag'] = in_array($tag, TAGS, true) ? $tag : 'personal';
    }
    if ($provider === 'pos') {
        $url = rtrim(trim((string) ($input['url'] ?? '')), '/');
        if ($url !== '') {
            http_assert_https_host($url, ['supabase.co', 'supabase.in']);
            $parts = parse_url($url);
            if (!is_array($parts) || !empty($parts['path']) && $parts['path'] !== '/') {
                throw new HttpException(400, 'Use the Supabase project URL, without a path.');
            }
            if (strlen($url) > 300) {
                throw new HttpException(400, 'Supabase URL is too long.');
            }
        }
        $settings['url'] = $url;
        $settings['includeRefurb'] = bool_value($input['includeRefurb'] ?? false);
        $done = trim((string) ($input['doneStatus'] ?? 'done'));
        if ($done === '' || text_length($done) > 40 || preg_match('/^[A-Za-z0-9 _.-]+$/', $done) !== 1) {
            throw new HttpException(400, 'Done status must be a short label such as done.');
        }
        $settings['doneStatus'] = $done;
        $tables = is_array($input['tables'] ?? null) ? $input['tables'] : [];
        $settings['tables'] = [
            'tasks' => clean_column_map($tables['tasks'] ?? null),
            'refurb_tasks' => clean_column_map($tables['refurb_tasks'] ?? null),
        ];
    }
    if ($provider === 'reminders') {
        $appleId = strtolower(trim((string) ($input['appleId'] ?? '')));
        if ($appleId !== '' && !valid_email($appleId)) {
            throw new HttpException(400, 'Enter the Apple ID email.');
        }
        $settings['appleId'] = $appleId;
        $hrefs = [];
        foreach (is_array($input['listHrefs'] ?? null) ? $input['listHrefs'] : [] as $href) {
            if (!is_string($href) || strlen($href) > 500) {
                continue;
            }
            if (!str_starts_with($href, 'https://') && !str_starts_with($href, '/')) {
                continue;
            }
            if (str_starts_with($href, 'https://')) {
                http_assert_https_host($href, ['icloud.com']);
            }
            if (!in_array($href, $hrefs, true)) {
                $hrefs[] = $href;
            }
            if (count($hrefs) >= 40) {
                break;
            }
        }
        $settings['listHrefs'] = $hrefs;
        $found = [];
        foreach (is_array($input['foundLists'] ?? null) ? $input['foundLists'] : [] as $list) {
            if (!is_array($list)) {
                continue;
            }
            $href = (string) ($list['href'] ?? '');
            if ($href === '' || strlen($href) > 500) {
                continue;
            }
            $components = [];
            foreach (is_array($list['components'] ?? null) ? $list['components'] : [] as $component) {
                if (is_string($component) && preg_match('/^[A-Z]{2,20}$/', $component) === 1) {
                    $components[] = $component;
                }
            }
            $found[] = [
                'href' => $href,
                'name' => text_clip(trim((string) ($list['name'] ?? 'List')), 120),
                'vtodo' => bool_value($list['vtodo'] ?? false),
                'components' => $components,
            ];
            if (count($found) >= 80) {
                break;
            }
        }
        $settings['foundLists'] = $found;
    }
    return $settings;
}

function merge_integration_secrets(string $provider, array $current, array $incoming): array
{
    if ($provider === 'clickup') {
        $token = trim((string) ($incoming['token'] ?? ''));
        if ($token !== '') {
            if (strlen($token) < 8 || strlen($token) > 400) {
                throw new HttpException(400, 'That ClickUp token does not look right.');
            }
            $current['token'] = $token;
        }
    }
    if ($provider === 'gcal') {
        $url = trim((string) ($incoming['url'] ?? ''));
        if ($url !== '') {
            http_assert_https_host($url, ['calendar.google.com']);
            if (strlen($url) > 2000) {
                throw new HttpException(400, 'That calendar address is too long.');
            }
            $current['url'] = $url;
        }
    }
    if ($provider === 'pos') {
        $key = trim((string) ($incoming['apiKey'] ?? ''));
        if ($key !== '') {
            if (strlen($key) < 10 || strlen($key) > 2000) {
                throw new HttpException(400, 'That Supabase key does not look right.');
            }
            $current['apiKey'] = $key;
        }
    }
    if ($provider === 'reminders') {
        $email = strtolower(trim((string) ($incoming['appleId'] ?? '')));
        $password = preg_replace('/\s+/', '', (string) ($incoming['appPassword'] ?? '')) ?? '';
        if ($email !== '') {
            if (!valid_email($email)) {
                throw new HttpException(400, 'Enter the Apple ID email.');
            }
            $current['appleId'] = $email;
        }
        if ($password !== '') {
            if (strlen($password) < 8 || strlen($password) > 80) {
                throw new HttpException(400, 'That app-specific password does not look right.');
            }
            $current['appPassword'] = $password;
        }
    }
    return $current;
}

function integration_has_secret(string $provider, array $secrets): bool
{
    return match ($provider) {
        'clickup' => trim((string) ($secrets['token'] ?? '')) !== '',
        'gcal' => trim((string) ($secrets['url'] ?? '')) !== '',
        'pos' => trim((string) ($secrets['apiKey'] ?? '')) !== '',
        'reminders' => trim((string) ($secrets['appleId'] ?? '')) !== '' && trim((string) ($secrets['appPassword'] ?? '')) !== '',
        default => false,
    };
}

function integrations_save(array $user, string $provider, array $body): array
{
    if (!in_array($provider, ['clickup', 'gcal', 'pos', 'reminders'], true)) {
        throw new HttpException(400, 'Unknown integration.');
    }
    if (!integrations_table_ready()) {
        throw new HttpException(409, 'Run database migrations before saving an integration.');
    }
    if (($provider === 'clickup' || $provider === 'pos') && $user['account_role'] !== 'owner') {
        throw new HttpException(403, 'Only the owner can connect that.');
    }
    $userId = ($provider === 'clickup' || $provider === 'pos') ? OWNER_ID : $user['id'];
    if (!find_user($userId)) {
        throw new HttpException(400, 'Account not found.');
    }
    $settings = normalize_integration_settings($provider, is_array($body['settings'] ?? null) ? $body['settings'] : []);
    $enabled = bool_value($body['enabled'] ?? false) ? 1 : 0;
    $existing = integration_by_provider_user($provider, $userId);
    $currentSecrets = [];
    if ($existing && is_string($existing['secret_blob'] ?? null) && $existing['secret_blob'] !== '') {
        try {
            $currentSecrets = integration_secrets($existing);
        } catch (RuntimeException $e) {
            throw new HttpException(400, $e->getMessage());
        }
    }
    $secrets = merge_integration_secrets($provider, $currentSecrets, is_array($body['secrets'] ?? null) ? $body['secrets'] : []);
    if ($provider === 'reminders' && !empty($secrets['appleId']) && $settings['appleId'] === '') {
        $settings['appleId'] = (string) $secrets['appleId'];
    }
    if ($provider === 'reminders' && $settings['appleId'] !== '') {
        $secrets['appleId'] = $settings['appleId'];
    }
    if ($enabled === 1 && !integration_has_secret($provider, $secrets)) {
        throw new HttpException(400, 'Enter the credential before turning sync on.');
    }
    $blob = $existing['secret_blob'] ?? null;
    if (integration_has_secret($provider, $secrets)) {
        try {
            $blob = secret_encrypt(json_encode($secrets, JSON_UNESCAPED_SLASHES));
        } catch (RuntimeException $e) {
            throw new HttpException(400, $e->getMessage());
        }
    }
    $now = mysql_now();
    $id = $existing['id'] ?? integration_row_id($provider, $userId);
    $encoded = json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new HttpException(400, 'Settings could not be saved.');
    }
    if ($existing) {
        q(
            'UPDATE integrations SET enabled = ?, settings = ?, secret_blob = ?, updated_at = ? WHERE id = ?',
            [$enabled, $encoded, $blob, $now, $id]
        );
    } else {
        q(
            'INSERT INTO integrations (id, provider, user_id, enabled, settings, secret_blob, last_sync_at, last_error, last_summary, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)',
            [$id, $provider, $userId, $enabled, $encoded, $blob, $now]
        );
    }
    $fresh = integration_by_id($id);
    if (!$fresh) {
        throw new HttpException(500, 'Something went wrong.');
    }
    $account = find_user($userId);
    return ['integration' => integration_public($fresh, (string) ($account['name'] ?? ''))];
}

function integration_finish(string $id, ?string $error, ?string $summary): void
{
    q(
        'UPDATE integrations SET last_sync_at = ?, last_error = ?, last_summary = ?, updated_at = ? WHERE id = ?',
        [$error === null && $summary === null ? mysql_now() : mysql_now(), $error !== null ? text_clip($error, 2000) : null, $summary !== null ? text_clip($summary, 500) : null, mysql_now(), $id]
    );
}

function integration_update_settings(string $id, array $settings): void
{
    $encoded = json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        return;
    }
    q('UPDATE integrations SET settings = ?, updated_at = ? WHERE id = ?', [$encoded, mysql_now(), $id]);
}
