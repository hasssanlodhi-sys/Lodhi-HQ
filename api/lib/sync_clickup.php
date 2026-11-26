<?php

declare(strict_types=1);

function clickup_json(string $method, string $token, string $path, ?array $body = null): array
{
    if (preg_match('/^[A-Za-z0-9_\/?&=.+-]+$/', $path) !== 1) {
        throw new RuntimeException('ClickUp request path is invalid.');
    }
    $headers = ['Authorization: ' . $token, 'Accept: application/json'];
    $options = [
        'headers' => $headers,
        'allowed_hosts' => ['api.clickup.com'],
        'timeout' => 25,
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $options['headers'] = $headers;
        $options['body'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    $res = http_call($method, 'https://api.clickup.com/api/v2' . $path, $options);
    if ($res['status'] === 401 || $res['status'] === 403) {
        throw new RuntimeException('ClickUp rejected the token.');
    }
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException('ClickUp returned HTTP ' . $res['status'] . '.');
    }
    $data = json_decode($res['body'], true);
    return is_array($data) ? $data : [];
}

function clickup_lists(string $token, string $spaceId, string $spaceName): array
{
    $lists = [];
    $folderless = clickup_json('GET', $token, '/space/' . rawurlencode($spaceId) . '/list?archived=false');
    foreach (is_array($folderless['lists'] ?? null) ? $folderless['lists'] : [] as $list) {
        if (is_array($list) && !empty($list['id'])) {
            $lists[] = ['id' => (string) $list['id'], 'name' => (string) ($list['name'] ?? ''), 'space' => $spaceName];
        }
    }
    $folders = clickup_json('GET', $token, '/space/' . rawurlencode($spaceId) . '/folder?archived=false');
    foreach (is_array($folders['folders'] ?? null) ? $folders['folders'] : [] as $folder) {
        if (!is_array($folder) || empty($folder['id'])) {
            continue;
        }
        $nested = clickup_json('GET', $token, '/folder/' . rawurlencode((string) $folder['id']) . '/list?archived=false');
        foreach (is_array($nested['lists'] ?? null) ? $nested['lists'] : [] as $list) {
            if (is_array($list) && !empty($list['id'])) {
                $lists[] = ['id' => (string) $list['id'], 'name' => (string) ($list['name'] ?? ''), 'space' => $spaceName];
            }
        }
    }
    return $lists;
}

function clickup_list_tasks(string $token, string $listId): array
{
    $all = [];
    for ($page = 0; $page < 20; $page++) {
        $data = clickup_json(
            'GET',
            $token,
            '/list/' . rawurlencode($listId) . '/task?archived=false&include_closed=true&subtasks=true&page=' . $page
        );
        $tasks = $data['tasks'] ?? [];
        if (!is_array($tasks) || $tasks === []) {
            break;
        }
        foreach ($tasks as $task) {
            if (is_array($task)) {
                $all[] = $task;
            }
        }
        if (count($tasks) < 100 || !empty($data['last_page'])) {
            break;
        }
    }
    return $all;
}

function clickup_closed_status(string $token, string $listId): string
{
    static $cache = [];
    if (isset($cache[$listId])) {
        return $cache[$listId];
    }
    $list = clickup_json('GET', $token, '/list/' . rawurlencode($listId));
    $closed = '';
    foreach (is_array($list['statuses'] ?? null) ? $list['statuses'] : [] as $status) {
        if (!is_array($status)) {
            continue;
        }
        $type = strtolower((string) ($status['type'] ?? ''));
        if ($type === 'closed' || $type === 'done') {
            $closed = (string) ($status['status'] ?? '');
            if ($closed !== '') {
                break;
            }
        }
    }
    if ($closed === '') {
        throw new RuntimeException('ClickUp list has no closed status.');
    }
    $cache[$listId] = $closed;
    return $closed;
}

function clickup_push_done(array $row, array $identity): void
{
    $saved = integration_by_provider_user('clickup', OWNER_ID);
    if (!$saved || (int) $saved['enabled'] !== 1) {
        throw new RuntimeException('ClickUp sync is off.');
    }
    $token = trim((string) (integration_secrets($saved)['token'] ?? ''));
    if ($token === '') {
        throw new RuntimeException('ClickUp token is missing.');
    }
    $taskId = (string) ($identity['externalId'] ?? '');
    if (preg_match('/^[A-Za-z0-9]+$/', $taskId) !== 1) {
        throw new RuntimeException('ClickUp task id is missing.');
    }
    $listId = (string) ($identity['extra']['list'] ?? '');
    if ($listId === '') {
        $remote = clickup_json('GET', $token, '/task/' . rawurlencode($taskId));
        $listId = (string) ($remote['list']['id'] ?? '');
    }
    if (preg_match('/^[A-Za-z0-9]+$/', $listId) !== 1) {
        throw new RuntimeException('Could not find the ClickUp list for this task.');
    }
    $status = clickup_closed_status($token, $listId);
    clickup_json('PUT', $token, '/task/' . rawurlencode($taskId), ['status' => $status]);
}

function clickup_sync(): array
{
    $row = integration_by_provider_user('clickup', OWNER_ID);
    if (!$row || (int) $row['enabled'] !== 1) {
        return ['ok' => true, 'skipped' => true, 'summary' => 'ClickUp is off.'];
    }
    try {
        $settings = integration_settings($row);
        $token = trim((string) (integration_secrets($row)['token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('ClickUp token is missing.');
        }
        $spaceIds = is_array($settings['spaceIds'] ?? null) ? $settings['spaceIds'] : [];
        if ($spaceIds === []) {
            throw new RuntimeException('Choose at least one ClickUp space.');
        }
        $created = 0;
        $updated = 0;
        $pushed = 0;
        $skipped = 0;
        $errors = [];
        foreach ($spaceIds as $spaceId) {
            if (!is_string($spaceId) || preg_match('/^[A-Za-z0-9]+$/', $spaceId) !== 1) {
                continue;
            }
            try {
                $space = clickup_json('GET', $token, '/space/' . rawurlencode($spaceId));
                $spaceName = (string) ($space['name'] ?? '');
                foreach (clickup_lists($token, $spaceId, $spaceName) as $list) {
                    $tag = clickup_tag_for($spaceName, $list['name'], $settings);
                    foreach (clickup_list_tasks($token, $list['id']) as $task) {
                        $taskId = (string) ($task['id'] ?? '');
                        if ($taskId === '' || preg_match('/^[A-Za-z0-9]+$/', $taskId) !== 1) {
                            $skipped++;
                            continue;
                        }
                        [$status, $closed] = clickup_status_label(is_array($task['status'] ?? null) ? $task['status'] : []);
                        $due = clickup_due($task);
                        $assignee = OWNER_ID;
                        foreach (is_array($task['assignees'] ?? null) ? $task['assignees'] : [] as $person) {
                            if (!is_array($person)) {
                                continue;
                            }
                            $matched = user_id_for_email((string) ($person['email'] ?? ''));
                            if ($matched) {
                                $assignee = $matched;
                                break;
                            }
                        }
                        $estimate = 30;
                        if (!empty($task['time_estimate'])) {
                            $estimate = (int) round(((int) $task['time_estimate']) / 60000);
                        }
                        $ids = clickup_task_ids($taskId);
                        $applied = apply_synced_task([
                            'provider' => 'clickup',
                            'externalId' => $taskId,
                            'candidateIds' => [$ids['canonical']],
                            'canonicalId' => $ids['canonical'],
                            'userId' => OWNER_ID,
                            'title' => (string) ($task['name'] ?? ''),
                            'tag' => $tag,
                            'deadline' => $due['deadline'],
                            'allDay' => $due['allDay'],
                            'priority' => clickup_priority_label($task['priority'] ?? null),
                            'assigneeId' => $assignee,
                            'status' => $status,
                            'remoteClosed' => $closed,
                            'estimatedTime' => $estimate,
                            'notesBody' => (string) ($task['description'] ?? ''),
                            'marker' => source_marker('clickup', $taskId, ['list' => $list['id']]),
                            'recurrence' => null,
                            'twoWay' => true,
                        ]);
                        if ($applied['action'] === 'created') {
                            $created++;
                        } elseif ($applied['action'] === 'updated') {
                            $updated++;
                        } else {
                            $skipped++;
                        }
                        if (!empty($applied['needsPush']) && $applied['id']) {
                            try {
                                $fresh = task_by_id($applied['id']);
                                if ($fresh) {
                                    clickup_push_done($fresh, synced_identity($fresh) ?? ['externalId' => $taskId, 'extra' => ['list' => $list['id']]]);
                                    $pushed++;
                                }
                            } catch (Throwable $e) {
                                $errors[] = sync_public_error($e);
                            }
                        }
                    }
                }
            } catch (Throwable $e) {
                $errors[] = sync_public_error($e);
            }
        }
        $summary = $created . ' added, ' . $updated . ' updated, ' . $pushed . ' closed in ClickUp.';
        $error = $errors[0] ?? null;
        integration_finish((string) $row['id'], $error, $summary);
        return ['ok' => $error === null, 'summary' => $summary, 'error' => $error, 'created' => $created, 'updated' => $updated];
    } catch (Throwable $e) {
        $message = sync_public_error($e);
        integration_finish((string) $row['id'], $message, null);
        return ['ok' => false, 'error' => $message];
    }
}

function clickup_discover(array $user, array $body): array
{
    if ($user['account_role'] !== 'owner') {
        throw new HttpException(403, 'Only the owner can do that.');
    }
    $saved = integration_by_provider_user('clickup', OWNER_ID);
    if (!$saved) {
        throw new HttpException(400, 'Save the ClickUp token first.');
    }
    $token = trim((string) (integration_secrets($saved)['token'] ?? ''));
    if ($token === '') {
        throw new HttpException(400, 'Save the ClickUp token first.');
    }
    $teamId = trim((string) ($body['teamId'] ?? ''));
    if ($teamId === '') {
        $data = clickup_json('GET', $token, '/team');
        $teams = [];
        foreach (is_array($data['teams'] ?? null) ? $data['teams'] : [] as $team) {
            if (is_array($team) && !empty($team['id'])) {
                $teams[] = ['id' => (string) $team['id'], 'name' => (string) ($team['name'] ?? 'Workspace')];
            }
        }
        return ['teams' => $teams];
    }
    if (preg_match('/^[A-Za-z0-9]+$/', $teamId) !== 1) {
        throw new HttpException(400, 'ClickUp workspace id is invalid.');
    }
    $data = clickup_json('GET', $token, '/team/' . rawurlencode($teamId) . '/space?archived=false');
    $spaces = [];
    foreach (is_array($data['spaces'] ?? null) ? $data['spaces'] : [] as $space) {
        if (is_array($space) && !empty($space['id'])) {
            $spaces[] = ['id' => (string) $space['id'], 'name' => (string) ($space['name'] ?? 'Space')];
        }
    }
    return ['spaces' => $spaces];
}
