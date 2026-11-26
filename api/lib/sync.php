<?php

declare(strict_types=1);

function user_id_for_email(?string $email): ?string
{
    $email = strtolower(trim((string) $email));
    if ($email === '' || !valid_email($email)) {
        return null;
    }
    $user = find_user_by_email($email);
    if (!$user || (int) $user['active'] !== 1) {
        return null;
    }
    return (string) $user['id'];
}

function find_task_by_source(string $provider, string $externalId, ?string $userId, ?string $mustContain = null): ?array
{
    if (preg_match('/^[A-Za-z0-9_.:@+-]{1,180}$/', $externalId) !== 1) {
        return null;
    }
    $like = '%[source: ' . $provider . ':' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $externalId) . '%';
    $rows = q("SELECT * FROM tasks WHERE notes LIKE ? ESCAPE '\\\\' ORDER BY created_at ASC LIMIT 30", [$like])->fetchAll();
    foreach ($rows as $row) {
        if (synced_is_snapshot($row)) {
            continue;
        }
        $notes = (string) $row['notes'];
        if ($mustContain !== null && !str_contains($notes, $mustContain)) {
            continue;
        }
        $pattern = '/\[source:\s*' . preg_quote($provider, '/') . ':' . preg_quote($externalId, '/') . '(?:[\s\]])/';
        if (preg_match($pattern, $notes) !== 1) {
            continue;
        }
        if ($userId !== null && $provider !== 'clickup' && $provider !== 'pos') {
            $markerUser = null;
            if (preg_match('/\[source:[^\]]*?\suser:([A-Za-z0-9_-]+)/', $notes, $m) === 1) {
                $markerUser = $m[1];
            }
            if ($markerUser !== null && $markerUser !== $userId) {
                continue;
            }
            if ($markerUser === null && $userId !== OWNER_ID && (string) $row['assignee_id'] !== $userId) {
                continue;
            }
        }
        return $row;
    }
    return null;
}

function snapshot_done_task(array $existing, string $day): void
{
    $dayKey = str_replace('-', '', $day);
    $id = (string) $existing['id'] . '-d' . $dayKey;
    if (!valid_id($id)) {
        $id = external_fit_id('gcal-snap-', (string) $existing['id'] . $dayKey);
    }
    if (task_by_id($id)) {
        return;
    }
    $notes = (string) $existing['notes'];
    if (!str_contains($notes, 'snapshot:1')) {
        $notes = preg_replace('/\[source:/', '[source: snapshot:1 ', $notes, 1) ?? ($notes . ' [source: snapshot:1]');
    }
    insert_task([
        'id' => $id,
        'title' => $existing['title'],
        'tag' => $existing['tag'],
        'deadline' => $existing['deadline'],
        'allDay' => (int) $existing['all_day'],
        'priority' => $existing['priority'],
        'assigneeId' => $existing['assignee_id'],
        'status' => 'Done',
        'estimatedTime' => (int) $existing['estimated_time'],
        'notes' => text_clip($notes, 5000),
        'completedAt' => $existing['completed_at'],
        'onTime' => $existing['on_time'] === null ? null : (int) $existing['on_time'],
        'recurrence' => $existing['recurrence'],
        'helpedMemberId' => $existing['helped_member_id'],
        'createdAt' => $existing['created_at'],
    ]);
}

function apply_synced_task(array $spec): array
{
    $existing = null;
    foreach ($spec['candidateIds'] as $id) {
        if (!is_string($id) || !valid_id($id)) {
            continue;
        }
        $row = task_by_id($id);
        if ($row && !synced_is_snapshot($row)) {
            $existing = $row;
            break;
        }
    }
    if (!$existing) {
        $existing = find_task_by_source(
            $spec['provider'],
            $spec['externalId'],
            $spec['userId'] ?? null,
            isset($spec['mustContain']) && is_string($spec['mustContain']) ? $spec['mustContain'] : null
        );
    }
    $remoteClosed = (bool) $spec['remoteClosed'];
    if (!$existing && $remoteClosed) {
        return ['action' => 'skipped', 'needsPush' => false, 'id' => null];
    }
    $title = trim((string) $spec['title']);
    $title = preg_replace('/\s+/', ' ', $title) ?? $title;
    if ($title === '') {
        $title = 'Untitled';
    }
    $title = text_clip($title, 200);
    $notes = notes_with_marker((string) ($spec['notesBody'] ?? ''), (string) $spec['marker']);
    $status = (string) $spec['status'];
    $completedAt = null;
    $onTime = null;
    $reopened = false;
    if ($existing && $existing['status'] === 'Done' && !$remoteClosed && ($spec['recurrence'] ?? null) === 'daily') {
        $tzName = (string) ($spec['timezone'] ?? 'UTC');
        try {
            $tz = new DateTimeZone($tzName !== '' ? $tzName : 'UTC');
        } catch (Exception) {
            $tz = new DateTimeZone('UTC');
        }
        $occDay = null;
        $doneDay = null;
        if (!empty($spec['deadline'])) {
            $occDay = (new DateTimeImmutable((string) $spec['deadline'], new DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d');
        }
        if (!empty($existing['completed_at'])) {
            $doneDay = (new DateTimeImmutable((string) $existing['completed_at'], new DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d');
        }
        if ($occDay && $doneDay && $doneDay < $occDay) {
            snapshot_done_task($existing, $doneDay);
            $reopened = true;
            $status = 'To Do';
        } else {
            $status = 'Done';
            $completedAt = $existing['completed_at'];
        }
    } elseif ($existing && $existing['status'] === 'Done' && !$remoteClosed) {
        $status = 'Done';
        $completedAt = $existing['completed_at'];
    } elseif ($remoteClosed) {
        $status = 'Done';
        $completedAt = $existing['completed_at'] ?? null;
    }
    if ($status === 'Done') {
        if ($completedAt === null || $completedAt === '') {
            $completedAt = mysql_now();
        }
        $deadline = $spec['deadline'];
        $onTime = $deadline === null || (string) $completedAt <= (string) $deadline ? 1 : 0;
    }
    $assignee = (string) $spec['assigneeId'];
    if (!find_user($assignee)) {
        $assignee = OWNER_ID;
    }
    if (!find_user($assignee)) {
        throw new RuntimeException('The owner account is missing, so a synced task cannot be saved.');
    }
    $tag = (string) $spec['tag'];
    if (!in_array($tag, TAGS, true)) {
        $tag = 'personal';
    }
    $estimate = (int) ($spec['estimatedTime'] ?? 30);
    if ($estimate < 15) {
        $estimate = 15;
    }
    if ($estimate > 20000) {
        $estimate = 20000;
    }
    $task = [
        'id' => $existing['id'] ?? (string) $spec['canonicalId'],
        'title' => $title,
        'tag' => $tag,
        'deadline' => $spec['deadline'],
        'allDay' => !empty($spec['allDay']) ? 1 : 0,
        'priority' => in_array($spec['priority'] ?? '', PRIORITIES, true) ? $spec['priority'] : 'Medium',
        'assigneeId' => $assignee,
        'status' => in_array($status, STATUSES, true) ? $status : 'To Do',
        'estimatedTime' => $estimate,
        'notes' => $notes,
        'completedAt' => $status === 'Done' ? $completedAt : null,
        'onTime' => $status === 'Done' ? $onTime : null,
        'recurrence' => ($spec['recurrence'] ?? null) === 'daily' ? 'daily' : null,
        'helpedMemberId' => $existing['helped_member_id'] ?? null,
        'createdAt' => $existing['created_at'] ?? mysql_now(),
    ];
    if (!valid_id($task['id'])) {
        throw new RuntimeException('Synced task id is invalid.');
    }
    if ($existing) {
        update_task($task);
        $action = 'updated';
    } else {
        insert_task($task);
        $action = 'created';
    }
    $needsPush = (bool) ($existing && $existing['status'] === 'Done' && !$remoteClosed && !empty($spec['twoWay']) && !$reopened);
    return ['action' => $action, 'needsPush' => $needsPush, 'id' => $task['id']];
}

function sync_provider(string $provider): array
{
    return match ($provider) {
        'clickup' => clickup_sync(),
        'gcal' => gcal_sync(),
        'pos' => pos_sync(),
        'reminders' => reminders_sync(),
        default => throw new RuntimeException('Unknown integration.'),
    };
}

function sync_all(?string $only, bool $throwIfBusy = true): array
{
    if ($only === '') {
        $only = null;
    }
    if ($only !== null && !in_array($only, ['clickup', 'gcal', 'pos', 'reminders'], true)) {
        throw new HttpException(400, 'Unknown integration.');
    }
    if (!integrations_table_ready()) {
        throw new HttpException(409, 'Run database migrations before syncing.');
    }
    set_time_limit(180);
    $pdo = db();
    $locked = (int) $pdo->query("SELECT GET_LOCK('lodhi_hq_sync', 0)")->fetchColumn();
    if ($locked !== 1) {
        if ($throwIfBusy) {
            throw new HttpException(409, 'A sync is already running.');
        }
        return ['ok' => true, 'skipped' => 'already running', 'results' => []];
    }
    try {
        $results = [];
        foreach (['clickup', 'gcal', 'pos', 'reminders'] as $provider) {
            if ($only !== null && $only !== $provider) {
                continue;
            }
            try {
                $results[$provider] = sync_provider($provider);
            } catch (Throwable $e) {
                $message = sync_public_error($e);
                error_log('[lodhi-hq] sync ' . $provider . ' failed: ' . $message);
                $results[$provider] = ['ok' => false, 'error' => $message];
                try {
                    foreach (integrations_for_provider($provider) as $row) {
                        if ((int) $row['enabled'] === 1 && ($row['last_error'] === null || $row['last_error'] === '')) {
                            integration_finish((string) $row['id'], $message, null);
                        }
                    }
                } catch (Throwable) {
                    // The provider error is already in the result.
                }
            }
        }
        return ['ok' => true, 'results' => $results];
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('lodhi_hq_sync')");
    }
}

function integration_push_done(array $row): ?string
{
    $identity = synced_identity($row);
    if (!$identity || $identity['provider'] === 'gcal' || $identity['provider'] === 'snapshot') {
        return null;
    }
    try {
        if (!integrations_table_ready()) {
            return 'Saved in Lodhi HQ. Run migrations before the linked app can be updated.';
        }
        if ($identity['provider'] === 'clickup') {
            clickup_push_done($row, $identity);
        } elseif ($identity['provider'] === 'pos') {
            pos_push_done($row, $identity);
        } elseif ($identity['provider'] === 'reminders') {
            reminders_push_done($row, $identity);
        }
    } catch (Throwable $e) {
        $message = sync_public_error($e);
        try {
            $provider = $identity['provider'] === 'reminders' ? 'reminders' : $identity['provider'];
            $userId = $provider === 'reminders' ? (string) $row['assignee_id'] : OWNER_ID;
            $saved = integration_by_provider_user($provider, $userId);
            if ($saved) {
                integration_finish((string) $saved['id'], $message, $saved['last_summary']);
            }
        } catch (Throwable) {
            // Keep the warning even if the status row cannot be updated.
        }
        return 'Saved in Lodhi HQ, but the linked app was not updated: ' . $message;
    }
    return null;
}
