<?php

declare(strict_types=1);

function pos_request(string $method, string $url, string $key, ?array $body = null): array
{
    $headers = [
        'apikey: ' . $key,
        'Authorization: Bearer ' . $key,
        'Accept: application/json',
    ];
    $options = [
        'headers' => $headers,
        'allowed_hosts' => ['supabase.co', 'supabase.in'],
        'timeout' => 30,
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'Prefer: return=minimal';
        $options['headers'] = $headers;
        $options['body'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    $res = http_call($method, $url, $options);
    if ($res['status'] === 401 || $res['status'] === 403) {
        throw new RuntimeException('Supabase rejected the key. Use the service role key if row security blocks the anon key.');
    }
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException('Supabase returned HTTP ' . $res['status'] . '.');
    }
    if (trim($res['body']) === '') {
        return [];
    }
    $data = json_decode($res['body'], true);
    return is_array($data) ? $data : [];
}

function pos_base_url(array $settings): string
{
    $url = rtrim(trim((string) ($settings['url'] ?? '')), '/');
    if ($url === '') {
        throw new RuntimeException('Supabase project URL is missing.');
    }
    http_assert_https_host($url, ['supabase.co', 'supabase.in']);
    return $url;
}

function pos_fetch_table(string $base, string $key, string $table): array
{
    if (!in_array($table, ['tasks', 'refurb_tasks'], true)) {
        throw new RuntimeException('Unknown store table.');
    }
    $rows = [];
    for ($offset = 0; $offset < 2000; $offset += 500) {
        $page = pos_request('GET', $base . '/rest/v1/' . $table . '?select=*&limit=500&offset=' . $offset, $key);
        if (array_is_list($page) === false) {
            break;
        }
        foreach ($page as $row) {
            if (is_array($row)) {
                $rows[] = $row;
            }
        }
        if (count($page) < 500) {
            break;
        }
    }
    return $rows;
}

function pos_schema_columns(string $base, string $key, string $table): array
{
    try {
        $spec = pos_request('GET', $base . '/rest/v1/', $key);
    } catch (Throwable) {
        return [];
    }
    $props = $spec['definitions'][$table]['properties'] ?? null;
    if (!is_array($props)) {
        $props = $spec['components']['schemas'][$table]['properties'] ?? null;
    }
    if (!is_array($props)) {
        return [];
    }
    $names = [];
    foreach ($props as $name => $unused) {
        if (is_string($name)) {
            $names[] = $name;
        }
    }
    return $names;
}

function pos_sync_table(string $base, string $key, string $table, array $columns, string $doneStatus, array &$counts, array &$pushErrors): void
{
    if (!column_name_ok($columns['id'] ?? null) || !column_name_ok($columns['title'] ?? null)) {
        throw new RuntimeException('Map the id and title columns for ' . $table . ' before syncing.');
    }
    $rows = pos_fetch_table($base, $key, $table);
    foreach ($rows as $row) {
        $externalId = (string) ($row[$columns['id']] ?? '');
        if ($externalId === '' || preg_match('/^[A-Za-z0-9_.:-]{1,80}$/', $externalId) !== 1) {
            $counts['skipped']++;
            continue;
        }
        $title = (string) ($row[$columns['title']] ?? '');
        $notes = '';
        if (column_name_ok($columns['notes'] ?? null) && isset($row[$columns['notes']])) {
            $notes = (string) $row[$columns['notes']];
        }
        $due = ['deadline' => null, 'allDay' => 0];
        if (column_name_ok($columns['due'] ?? null)) {
            $due = pos_parse_due($row[$columns['due']] ?? null);
        }
        $closed = pos_is_done($row, $columns);
        $status = $closed ? 'Done' : pos_open_status($row, $columns);
        $priority = 'Medium';
        if (column_name_ok($columns['priority'] ?? null)) {
            $priority = pos_priority($row[$columns['priority']] ?? null);
        }
        $assignee = OWNER_ID;
        if (column_name_ok($columns['assignee'] ?? null)) {
            $rawAssignee = $row[$columns['assignee']] ?? '';
            if (is_string($rawAssignee)) {
                $matched = user_id_for_email($rawAssignee);
                if ($matched) {
                    $assignee = $matched;
                } elseif (valid_id($rawAssignee) && find_user($rawAssignee)) {
                    $assignee = $rawAssignee;
                }
            }
        }
        $ids = pos_task_ids($externalId, $table);
        $applied = apply_synced_task([
            'provider' => 'pos',
            'externalId' => $externalId,
            'candidateIds' => [$ids['canonical']],
            'canonicalId' => $ids['canonical'],
            'userId' => OWNER_ID,
            'title' => $title,
            'tag' => 'cell-phone',
            'deadline' => $due['deadline'],
            'allDay' => $due['allDay'],
            'priority' => $priority,
            'assigneeId' => $assignee,
            'status' => $status,
            'remoteClosed' => $closed,
            'estimatedTime' => 30,
            'notesBody' => $notes,
            'marker' => source_marker('pos', $externalId, ['table' => $table === 'refurb_tasks' ? 'refurb' : 'tasks']),
            'mustContain' => ' table:' . ($table === 'refurb_tasks' ? 'refurb' : 'tasks'),
            'recurrence' => null,
            'twoWay' => true,
        ]);
        if ($applied['action'] === 'created') {
            $counts['created']++;
        } elseif ($applied['action'] === 'updated') {
            $counts['updated']++;
        } else {
            $counts['skipped']++;
        }
        if (!empty($applied['needsPush']) && $applied['id']) {
            try {
                $fresh = task_by_id($applied['id']);
                if ($fresh) {
                    pos_push_done($fresh, synced_identity($fresh) ?? [
                        'externalId' => $externalId,
                        'extra' => ['table' => $table === 'refurb_tasks' ? 'refurb' : 'tasks'],
                    ]);
                    $counts['pushed']++;
                }
            } catch (Throwable $e) {
                $pushErrors[] = sync_public_error($e);
            }
        }
    }
}

function pos_push_done(array $row, array $identity): void
{
    $saved = integration_by_provider_user('pos', OWNER_ID);
    if (!$saved || (int) $saved['enabled'] !== 1) {
        throw new RuntimeException('Cellphone Store sync is off.');
    }
    $settings = integration_settings($saved);
    $key = trim((string) (integration_secrets($saved)['apiKey'] ?? ''));
    if ($key === '') {
        throw new RuntimeException('Supabase key is missing.');
    }
    $base = pos_base_url($settings);
    $tableToken = (string) ($identity['extra']['table'] ?? 'tasks');
    $table = $tableToken === 'refurb' || $tableToken === 'refurb_tasks' ? 'refurb_tasks' : 'tasks';
    if (str_starts_with((string) $row['id'], 'pos-refurb-')) {
        $table = 'refurb_tasks';
    }
    $columns = $settings['tables'][$table] ?? pos_empty_columns();
    $externalId = (string) ($identity['externalId'] ?? '');
    if (preg_match('/^[A-Za-z0-9_.:-]{1,80}$/', $externalId) !== 1) {
        throw new RuntimeException('Store task id is missing.');
    }
    $idColumn = column_name_ok($columns['id'] ?? null) ? $columns['id'] : 'id';
    $patch = [];
    if (column_name_ok($columns['completed'] ?? null)) {
        $patch[$columns['completed']] = true;
    }
    if (column_name_ok($columns['status'] ?? null)) {
        $patch[$columns['status']] = (string) ($settings['doneStatus'] ?? 'done');
    }
    if ($patch === []) {
        throw new RuntimeException('No completed or status column is mapped, so the store task cannot be closed.');
    }
    pos_request(
        'PATCH',
        $base . '/rest/v1/' . $table . '?' . rawurlencode($idColumn) . '=eq.' . rawurlencode($externalId),
        $key,
        $patch
    );
}

function pos_sync(): array
{
    $row = integration_by_provider_user('pos', OWNER_ID);
    if (!$row || (int) $row['enabled'] !== 1) {
        return ['ok' => true, 'skipped' => true, 'summary' => 'Cellphone Store sync is off.'];
    }
    try {
        $settings = integration_settings($row);
        $key = trim((string) (integration_secrets($row)['apiKey'] ?? ''));
        if ($key === '') {
            throw new RuntimeException('Supabase key is missing.');
        }
        $base = pos_base_url($settings);
        $counts = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'pushed' => 0];
        $errors = [];
        $tables = $settings['tables']['tasks'] ?? pos_empty_columns();
        if (!column_name_ok($tables['id'] ?? null) || !column_name_ok($tables['title'] ?? null)) {
            $guessed = pos_guess_columns(pos_schema_columns($base, $key, 'tasks'));
            if (column_name_ok($guessed['id'] ?? null) && column_name_ok($guessed['title'] ?? null)) {
                $tables = $guessed;
                $settings['tables']['tasks'] = $guessed;
                integration_update_settings((string) $row['id'], $settings);
            }
        }
        pos_sync_table($base, $key, 'tasks', $tables, (string) ($settings['doneStatus'] ?? 'done'), $counts, $errors);
        if (!empty($settings['includeRefurb'])) {
            try {
                $refurb = $settings['tables']['refurb_tasks'] ?? pos_empty_columns();
                if (!column_name_ok($refurb['id'] ?? null) || !column_name_ok($refurb['title'] ?? null)) {
                    $guessed = pos_guess_columns(pos_schema_columns($base, $key, 'refurb_tasks'));
                    if (column_name_ok($guessed['id'] ?? null)) {
                        $refurb = $guessed;
                    }
                }
                pos_sync_table($base, $key, 'refurb_tasks', $refurb, (string) ($settings['doneStatus'] ?? 'done'), $counts, $errors);
            } catch (Throwable $e) {
                $errors[] = 'refurb_tasks: ' . sync_public_error($e);
            }
        }
        $summary = $counts['created'] . ' added, ' . $counts['updated'] . ' updated, ' . $counts['pushed'] . ' closed in the store.';
        $error = $errors[0] ?? null;
        integration_finish((string) $row['id'], $error, $summary);
        return ['ok' => $error === null, 'summary' => $summary, 'error' => $error];
    } catch (Throwable $e) {
        $message = sync_public_error($e);
        integration_finish((string) $row['id'], $message, null);
        return ['ok' => false, 'error' => $message];
    }
}

function pos_discover(array $user): array
{
    if ($user['account_role'] !== 'owner') {
        throw new HttpException(403, 'Only the owner can do that.');
    }
    $saved = integration_by_provider_user('pos', OWNER_ID);
    if (!$saved) {
        throw new HttpException(400, 'Save the Supabase URL and key first.');
    }
    $settings = integration_settings($saved);
    $key = trim((string) (integration_secrets($saved)['apiKey'] ?? ''));
    if ($key === '' || trim((string) ($settings['url'] ?? '')) === '') {
        throw new HttpException(400, 'Save the Supabase URL and key first.');
    }
    $base = pos_base_url($settings);
    $out = [];
    foreach (['tasks', 'refurb_tasks'] as $table) {
        $columns = pos_schema_columns($base, $key, $table);
        $sample = [];
        if ($columns === []) {
            try {
                $page = pos_request('GET', $base . '/rest/v1/' . $table . '?select=*&limit=1', $key);
                if (is_array($page) && isset($page[0]) && is_array($page[0])) {
                    $sample = $page[0];
                    $columns = array_keys($sample);
                }
            } catch (Throwable $e) {
                $out[$table] = ['columns' => [], 'mapping' => pos_empty_columns(), 'error' => sync_public_error($e)];
                continue;
            }
        }
        $out[$table] = [
            'columns' => $columns,
            'mapping' => pos_guess_columns($columns),
            'sampleKeys' => $sample !== [] ? array_keys($sample) : $columns,
        ];
    }
    return ['tables' => $out];
}
