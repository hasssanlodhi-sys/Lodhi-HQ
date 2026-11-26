<?php

declare(strict_types=1);

function xml_load(string $xml): DOMDocument
{
    if (!class_exists('DOMDocument')) {
        throw new RuntimeException('The PHP xml extension is required for Apple Reminders.');
    }
    if (strlen($xml) > 5000000) {
        throw new RuntimeException('The calendar response was too large.');
    }
    $doc = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $ok = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$ok) {
        throw new RuntimeException('iCloud returned XML that could not be read.');
    }
    return $doc;
}

function xml_href_in(DOMDocument $doc, string $parentLocal): ?string
{
    foreach ($doc->getElementsByTagName('*') as $node) {
        if (strtolower($node->localName) !== strtolower($parentLocal)) {
            continue;
        }
        foreach ($node->getElementsByTagName('*') as $child) {
            if (strtolower($child->localName) === 'href') {
                $text = trim($child->textContent);
                if ($text !== '') {
                    return $text;
                }
            }
        }
    }
    return null;
}

function caldav_request(string $method, string $url, string $appleId, string $password, ?string $body, array $headers): array
{
    http_assert_https_host($url, ['icloud.com']);
    $headers[] = 'Authorization: Basic ' . base64_encode($appleId . ':' . $password);
    $res = http_call($method, $url, [
        'headers' => $headers,
        'body' => $body,
        'timeout' => 30,
        'allowed_hosts' => ['icloud.com'],
        'max_bytes' => 5000000,
    ]);
    if ($res['status'] === 401 || $res['status'] === 403) {
        throw new RuntimeException('Apple rejected the Apple ID or app-specific password.');
    }
    return $res;
}

function caldav_abs(string $base, string $href): string
{
    if (str_starts_with($href, 'https://')) {
        return $href;
    }
    $parts = parse_url($base);
    $origin = 'https://' . ($parts['host'] ?? 'caldav.icloud.com');
    if (isset($parts['port']) && (int) $parts['port'] !== 443) {
        $origin .= ':' . $parts['port'];
    }
    if (str_starts_with($href, '/')) {
        return $origin . $href;
    }
    return rtrim($base, '/') . '/' . $href;
}

function reminders_credentials(array $row): array
{
    $secrets = integration_secrets($row);
    $settings = integration_settings($row);
    $appleId = strtolower(trim((string) ($secrets['appleId'] ?? $settings['appleId'] ?? '')));
    $password = (string) ($secrets['appPassword'] ?? '');
    if ($appleId === '' || $password === '') {
        throw new RuntimeException('Apple ID or app-specific password is missing.');
    }
    return [$appleId, $password, $settings];
}

function reminders_discover_lists(string $appleId, string $password): array
{
    $principalBody = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
    $root = caldav_request('PROPFIND', 'https://caldav.icloud.com/', $appleId, $password, $principalBody, [
        'Depth: 0',
        'Content-Type: application/xml; charset=utf-8',
    ]);
    if ($root['status'] < 200 || $root['status'] >= 300) {
        throw new RuntimeException('iCloud principal lookup returned HTTP ' . $root['status'] . '.');
    }
    $principal = xml_href_in(xml_load($root['body']), 'current-user-principal');
    if (!$principal) {
        throw new RuntimeException('iCloud did not return a calendar principal. Check the Apple ID.');
    }
    $principalUrl = caldav_abs($root['effective_url'], $principal);
    $homeBody = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>';
    $homeRes = caldav_request('PROPFIND', $principalUrl, $appleId, $password, $homeBody, [
        'Depth: 0',
        'Content-Type: application/xml; charset=utf-8',
    ]);
    if ($homeRes['status'] < 200 || $homeRes['status'] >= 300) {
        throw new RuntimeException('iCloud calendar home lookup returned HTTP ' . $homeRes['status'] . '.');
    }
    $homeHref = xml_href_in(xml_load($homeRes['body']), 'calendar-home-set');
    if (!$homeHref) {
        throw new RuntimeException('iCloud did not return a calendar home.');
    }
    $homeUrl = caldav_abs($homeRes['effective_url'], $homeHref);
    $listBody = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>';
    $listRes = caldav_request('PROPFIND', $homeUrl, $appleId, $password, $listBody, [
        'Depth: 1',
        'Content-Type: application/xml; charset=utf-8',
    ]);
    if ($listRes['status'] < 200 || $listRes['status'] >= 300) {
        throw new RuntimeException('iCloud list lookup returned HTTP ' . $listRes['status'] . '.');
    }
    $doc = xml_load($listRes['body']);
    $lists = [];
    foreach ($doc->getElementsByTagName('*') as $node) {
        if (strtolower($node->localName) !== 'response') {
            continue;
        }
        $href = '';
        $name = '';
        $components = [];
        foreach ($node->getElementsByTagName('*') as $child) {
            $local = strtolower($child->localName);
            if ($local === 'href' && $href === '') {
                $href = trim($child->textContent);
            }
            if ($local === 'displayname' && trim($child->textContent) !== '') {
                $name = trim($child->textContent);
            }
            if ($local === 'comp' && $child->attributes) {
                $attr = $child->attributes->getNamedItem('name');
                if ($attr && $attr->nodeValue !== '') {
                    $components[] = strtoupper($attr->nodeValue);
                }
            }
        }
        if ($href === '') {
            continue;
        }
        $absolute = caldav_abs($listRes['effective_url'], $href);
        if (rtrim($absolute, '/') === rtrim($homeUrl, '/')) {
            continue;
        }
        $components = array_values(array_unique($components));
        $lists[] = [
            'href' => $absolute,
            'name' => $name !== '' ? text_clip($name, 120) : 'Untitled list',
            'vtodo' => in_array('VTODO', $components, true),
            'selectable' => in_array('VTODO', $components, true) || $components === [],
            'components' => $components,
        ];
        if (count($lists) >= 80) {
            break;
        }
    }
    return $lists;
}

function reminders_report(string $listUrl, string $appleId, string $password): array
{
    $body = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
        . '<d:prop><d:getetag/><c:calendar-data/></d:prop>'
        . '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>'
        . '</c:calendar-query>';
    $res = caldav_request('REPORT', $listUrl, $appleId, $password, $body, [
        'Depth: 1',
        'Content-Type: application/xml; charset=utf-8',
    ]);
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException('iCloud reminder query returned HTTP ' . $res['status'] . '.');
    }
    $doc = xml_load($res['body']);
    $items = [];
    foreach ($doc->getElementsByTagName('*') as $node) {
        if (strtolower($node->localName) !== 'response') {
            continue;
        }
        $href = '';
        $etag = '';
        $calendar = '';
        foreach ($node->getElementsByTagName('*') as $child) {
            $local = strtolower($child->localName);
            if ($local === 'href' && $href === '') {
                $href = trim($child->textContent);
            }
            if ($local === 'getetag' && $etag === '') {
                $etag = trim($child->textContent);
            }
            if ($local === 'calendar-data' && $calendar === '') {
                $calendar = trim($child->textContent);
            }
        }
        if ($calendar === '') {
            continue;
        }
        foreach (ics_vtodos($calendar) as $todo) {
            $todo['href'] = caldav_abs($res['effective_url'], $href !== '' ? $href : $listUrl);
            $todo['etag'] = $etag;
            $todo['raw'] = $calendar;
            $items[] = $todo;
        }
    }
    return $items;
}

function reminders_push_done(array $row, array $identity): void
{
    $saved = integration_by_provider_user('reminders', (string) $row['assignee_id']);
    if (!$saved || (int) $saved['enabled'] !== 1) {
        throw new RuntimeException('Apple Reminders sync is off for this person.');
    }
    [$appleId, $password] = reminders_credentials($saved);
    $href = '';
    if (!empty($identity['extra']['href'])) {
        $href = b64url_decode((string) $identity['extra']['href']);
    }
    if ($href === '' || !str_starts_with($href, 'https://')) {
        throw new RuntimeException('Sync Reminders once so Lodhi HQ learns the list address, then complete the task again.');
    }
    $current = caldav_request('GET', $href, $appleId, $password, null, ['Accept: text/calendar']);
    if ($current['status'] < 200 || $current['status'] >= 300 || !str_contains($current['body'], 'BEGIN:VTODO')) {
        throw new RuntimeException('The reminder could not be read from iCloud.');
    }
    $updated = ics_complete_vtodo($current['body']);
    $headers = ['Content-Type: text/calendar; charset=utf-8'];
    $etag = $current['headers']['etag'] ?? '';
    if ($etag !== '') {
        $headers[] = 'If-Match: ' . $etag;
    }
    $put = caldav_request('PUT', $href, $appleId, $password, $updated, $headers);
    if (!in_array($put['status'], [200, 201, 204], true)) {
        throw new RuntimeException('iCloud did not accept the completed reminder (HTTP ' . $put['status'] . ').');
    }
}

function reminders_sync_row(array $row): array
{
    [$appleId, $password, $settings] = reminders_credentials($row);
    $hrefs = is_array($settings['listHrefs'] ?? null) ? $settings['listHrefs'] : [];
    if ($hrefs === []) {
        throw new RuntimeException('Pick at least one Reminders list.');
    }
    $tag = (string) ($settings['tag'] ?? 'personal');
    if (!in_array($tag, TAGS, true)) {
        $tag = 'personal';
    }
    $userId = (string) $row['user_id'];
    $created = 0;
    $updated = 0;
    $pushErrors = [];
    $foundNames = [];
    foreach ($hrefs as $href) {
        if (!is_string($href) || !str_starts_with($href, 'https://')) {
            continue;
        }
        foreach (reminders_report($href, $appleId, $password) as $todo) {
            $uid = (string) $todo['uid'];
            if (preg_match('/^[A-Za-z0-9_.:@+-]{1,120}$/', $uid) !== 1) {
                $uid = external_sanitize_id($uid);
                if ($uid === '') {
                    $uid = substr(hash('sha256', (string) $todo['uid']), 0, 24);
                }
            }
            $ids = reminders_task_ids($uid, $userId);
            $when = $todo['due'] ?? $todo['start'];
            $deadline = $when ? ics_deadline($when) : ['deadline' => null, 'allDay' => 0];
            $daily = is_array($todo['rrule']) && ics_plain_daily($todo['rrule']);
            $applied = apply_synced_task([
                'provider' => 'reminders',
                'externalId' => $uid,
                'candidateIds' => [$ids['canonical']],
                'canonicalId' => $ids['canonical'],
                'userId' => $userId,
                'title' => $todo['summary'] !== '' ? $todo['summary'] : 'Reminder',
                'tag' => $tag,
                'deadline' => $deadline['deadline'],
                'allDay' => $deadline['allDay'],
                'priority' => reminder_priority($todo['priority']),
                'assigneeId' => $userId,
                'status' => 'To Do',
                'remoteClosed' => false,
                'estimatedTime' => 30,
                'notesBody' => $todo['description'],
                'marker' => source_marker('reminders', $uid, [
                    'user' => $userId,
                    'href' => b64url_encode((string) $todo['href']),
                ]),
                'recurrence' => $daily ? 'daily' : null,
                'timezone' => is_array($when) ? (string) ($when['tz'] ?? 'UTC') : 'UTC',
                'twoWay' => true,
            ]);
            if ($applied['action'] === 'created') {
                $created++;
            } elseif ($applied['action'] === 'updated') {
                $updated++;
            }
            if (!empty($applied['needsPush']) && $applied['id']) {
                try {
                    $fresh = task_by_id($applied['id']);
                    if ($fresh) {
                        reminders_push_done($fresh, synced_identity($fresh) ?? []);
                    }
                } catch (Throwable $e) {
                    $pushErrors[] = sync_public_error($e);
                }
            }
        }
        $foundNames[] = $href;
    }
    $summary = $created . ' added, ' . $updated . ' updated from ' . count($foundNames) . ' list' . (count($foundNames) === 1 ? '' : 's') . '.';
    if ($pushErrors !== []) {
        throw new RuntimeException($summary . ' ' . $pushErrors[0]);
    }
    return ['summary' => $summary];
}

function reminders_sync(): array
{
    $rows = integrations_for_provider('reminders');
    $enabled = 0;
    $errors = [];
    $parts = [];
    foreach ($rows as $row) {
        if ((int) $row['enabled'] !== 1) {
            continue;
        }
        $enabled++;
        try {
            $result = reminders_sync_row($row);
            integration_finish((string) $row['id'], null, $result['summary']);
            $parts[] = (string) $row['user_id'] . ': ' . $result['summary'];
        } catch (Throwable $e) {
            $message = sync_public_error($e);
            integration_finish((string) $row['id'], $message, null);
            $errors[] = (string) $row['user_id'] . ': ' . $message;
        }
    }
    if ($enabled === 0) {
        return ['ok' => true, 'skipped' => true, 'summary' => 'No Apple Reminders accounts are on.'];
    }
    return [
        'ok' => $errors === [],
        'summary' => implode(' ', $parts),
        'error' => $errors[0] ?? null,
        'errors' => $errors,
    ];
}

function reminders_discover(array $user): array
{
    $saved = integration_by_provider_user('reminders', $user['id']);
    if (!$saved) {
        throw new HttpException(400, 'Save the Apple ID and app-specific password first.');
    }
    [$appleId, $password] = reminders_credentials($saved);
    $lists = reminders_discover_lists($appleId, $password);
    $settings = integration_settings($saved);
    $settings['foundLists'] = $lists;
    $settings['appleId'] = $appleId;
    integration_update_settings((string) $saved['id'], $settings);
    $vtodo = 0;
    foreach ($lists as $list) {
        if (!empty($list['vtodo'])) {
            $vtodo++;
        }
    }
    return [
        'lists' => $lists,
        'vtodoCount' => $vtodo,
        'note' => 'Apple\'s newer upgraded Reminders lists often are not exposed over CalDAV, so shared lists and some personal lists may be missing. The lists below are the ones iCloud returned.',
    ];
}
