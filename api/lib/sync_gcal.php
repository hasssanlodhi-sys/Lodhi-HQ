<?php

declare(strict_types=1);

function gcal_fetch(string $url): string
{
    http_assert_https_host($url, ['calendar.google.com']);
    $res = http_call('GET', $url, [
        'allowed_hosts' => ['calendar.google.com'],
        'timeout' => 40,
        'max_bytes' => 8000000,
        'headers' => ['Accept: text/calendar, text/plain, */*'],
    ]);
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException('Google Calendar returned HTTP ' . $res['status'] . '. Check the secret iCal address.');
    }
    if (!str_contains($res['body'], 'BEGIN:VCALENDAR')) {
        throw new RuntimeException('That address did not return a calendar feed.');
    }
    return $res['body'];
}

function gcal_sync_row(array $row): array
{
    $settings = integration_settings($row);
    $url = trim((string) (integration_secrets($row)['url'] ?? ''));
    if ($url === '') {
        throw new RuntimeException('Calendar address is missing.');
    }
    $tag = (string) ($settings['tag'] ?? 'personal');
    if (!in_array($tag, TAGS, true)) {
        $tag = 'personal';
    }
    $userId = (string) $row['user_id'];
    $ics = gcal_fetch($url);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $created = 0;
    $updated = 0;
    $skipped = 0;
    foreach (ics_expand_events($ics, $now, 'VEVENT') as $event) {
        if ($event['status'] === 'CANCELLED') {
            $skipped++;
            continue;
        }
        $ids = gcal_task_ids($event['uid'], $event['stamp'], $userId);
        $candidates = [$ids['canonical']];
        if ($userId === OWNER_ID && $ids['legacy'] !== $ids['canonical']) {
            $candidates[] = $ids['legacy'];
        }
        $when = $event['start'];
        $deadline = ics_deadline($when);
        $localId = gcal_uid_local($event['uid']);
        $externalId = $localId;
        $extra = ['user' => $userId];
        if (!empty($event['stamp'])) {
            $stampKey = preg_replace('/[^A-Za-z0-9]/', '', (string) $event['stamp']) ?? '';
            $extra['occ'] = $stampKey;
            if ($stampKey !== '') {
                $externalId = $localId . '_' . $stampKey;
            }
        }
        $applied = apply_synced_task([
            'provider' => 'gcal',
            'externalId' => $externalId,
            'candidateIds' => $candidates,
            'canonicalId' => $ids['canonical'],
            'userId' => $userId,
            'title' => $event['summary'] !== '' ? $event['summary'] : 'Calendar event',
            'tag' => $tag,
            'deadline' => $deadline['deadline'],
            'allDay' => $deadline['allDay'],
            'priority' => 'Medium',
            'assigneeId' => $userId,
            'status' => 'To Do',
            'remoteClosed' => false,
            'estimatedTime' => ics_estimate_minutes($event['start'], $event['end'], (bool) $deadline['allDay']),
            'notesBody' => $event['description'],
            'marker' => source_marker('gcal', $externalId, $extra),
            'recurrence' => $event['daily'] ? 'daily' : null,
            'timezone' => (string) ($when['tz'] ?? 'UTC'),
            'twoWay' => false,
        ]);
        if ($applied['action'] === 'created') {
            $created++;
        } elseif ($applied['action'] === 'updated') {
            $updated++;
        } else {
            $skipped++;
        }
    }
    return ['ok' => true, 'summary' => $created . ' added, ' . $updated . ' updated.', 'created' => $created, 'updated' => $updated, 'skipped' => $skipped];
}

function gcal_sync(): array
{
    $rows = integrations_for_provider('gcal');
    $enabled = 0;
    $errors = [];
    $parts = [];
    foreach ($rows as $row) {
        if ((int) $row['enabled'] !== 1) {
            continue;
        }
        $enabled++;
        try {
            $result = gcal_sync_row($row);
            integration_finish((string) $row['id'], null, $result['summary']);
            $parts[] = (string) $row['user_id'] . ': ' . $result['summary'];
        } catch (Throwable $e) {
            $message = sync_public_error($e);
            integration_finish((string) $row['id'], $message, null);
            $errors[] = (string) $row['user_id'] . ': ' . $message;
        }
    }
    if ($enabled === 0) {
        return ['ok' => true, 'skipped' => true, 'summary' => 'No Google calendars are on.'];
    }
    return [
        'ok' => $errors === [],
        'summary' => implode(' ', $parts),
        'error' => $errors[0] ?? null,
        'errors' => $errors,
    ];
}
