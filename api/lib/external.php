<?php

declare(strict_types=1);

/**
 * Pure helpers for external ids, source markers, tag mapping, and POS columns.
 * Safe to load without a database.
 */

function lodhi_owner_id(): string
{
    return defined('OWNER_ID') ? OWNER_ID : 'muhammad';
}

function external_sanitize_id(string $raw): string
{
    $clean = preg_replace('/[^A-Za-z0-9_-]/', '', $raw) ?? '';
    return $clean;
}

function external_fit_id(string $prefix, string $raw): string
{
    $clean = external_sanitize_id($raw);
    if ($clean === '') {
        $clean = substr(hash('sha256', $prefix . $raw), 0, 16);
    }
    $max = 64 - strlen($prefix);
    if ($max < 8) {
        $prefix = 'x-';
        $max = 62;
    }
    if (strlen($clean) > $max) {
        $hash = substr(hash('sha256', $raw), 0, 8);
        $clean = substr($clean, 0, max(0, $max - 9)) . '-' . $hash;
    }
    $id = $prefix . $clean;
    if (preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $id) !== 1) {
        $id = $prefix . substr(hash('sha256', $raw), 0, max(1, 64 - strlen($prefix)));
    }
    return $id;
}

function gcal_uid_local(string $uid): string
{
    $uid = trim($uid);
    if (preg_match('/^(.+)@google\.com$/i', $uid, $m) === 1) {
        return $m[1];
    }
    return $uid;
}

function gcal_task_ids(string $uid, ?string $stamp, string $userId): array
{
    $local = gcal_uid_local($uid);
    $stampClean = $stamp === null || $stamp === '' ? '' : (preg_replace('/[^A-Za-z0-9]/', '', $stamp) ?? '');
    $suffix = $stampClean !== '' ? $local . '_' . $stampClean : $local;
    $legacy = external_fit_id('gcal-', $suffix);
    if ($userId !== '' && $userId !== lodhi_owner_id()) {
        $userPart = external_sanitize_id($userId);
        if ($userPart === '') {
            $userPart = substr(hash('sha256', $userId), 0, 8);
        }
        return [
            'canonical' => external_fit_id('gcal-' . $userPart . '-', $suffix),
            'legacy' => $legacy,
        ];
    }
    return ['canonical' => $legacy, 'legacy' => $legacy];
}

function clickup_task_ids(string $taskId): array
{
    return ['canonical' => external_fit_id('clickup-', $taskId)];
}

function pos_task_ids(string $externalId, string $table): array
{
    $prefix = $table === 'refurb_tasks' ? 'pos-refurb-' : 'pos-';
    return ['canonical' => external_fit_id($prefix, $externalId)];
}

function reminders_task_ids(string $uid, string $userId): array
{
    $owner = external_fit_id('rem-', $uid);
    if ($userId !== '' && $userId !== lodhi_owner_id()) {
        $userPart = external_sanitize_id($userId);
        if ($userPart === '') {
            $userPart = substr(hash('sha256', $userId), 0, 8);
        }
        return [
            'canonical' => external_fit_id('rem-' . $userPart . '-', $uid),
            'legacy' => $owner,
        ];
    }
    return ['canonical' => $owner, 'legacy' => $owner];
}

function b64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function b64url_decode(string $value): string
{
    $pad = strlen($value) % 4;
    if ($pad > 0) {
        $value .= str_repeat('=', 4 - $pad);
    }
    $raw = base64_decode(strtr($value, '-_', '+/'), true);
    return $raw === false ? '' : $raw;
}

function source_marker(string $provider, string $externalId, array $extra = []): string
{
    $chunks = [$provider . ':' . $externalId];
    foreach ($extra as $key => $value) {
        if (!is_string($key) || !is_string($value) || $value === '') {
            continue;
        }
        if (preg_match('/^[a-z]+$/', $key) !== 1 || preg_match('/^[A-Za-z0-9_.:@+-]+$/', $value) !== 1) {
            continue;
        }
        $chunks[] = $key . ':' . $value;
    }
    return '[source: ' . implode(' ', $chunks) . ']';
}

function synced_is_snapshot(array $row): bool
{
    if (preg_match('/-d\d{8}$/', (string) ($row['id'] ?? '')) === 1) {
        return true;
    }
    return str_contains((string) ($row['notes'] ?? ''), 'snapshot:1');
}

function synced_identity(array $row): ?array
{
    $notes = (string) ($row['notes'] ?? '');
    if (preg_match('/\[source:\s*([a-z]+):([A-Za-z0-9_.:@+-]+)([^\]]*)\]/', $notes, $m) === 1 && $m[1] !== 'snapshot') {
        $extra = [];
        if (preg_match_all('/(?:^|\s)([a-z]+):([A-Za-z0-9_.:@+-]+)/', $m[3], $pairs, PREG_SET_ORDER)) {
            foreach ($pairs as $pair) {
                $extra[$pair[1]] = $pair[2];
            }
        }
        return ['provider' => $m[1], 'externalId' => $m[2], 'extra' => $extra];
    }
    $id = (string) ($row['id'] ?? '');
    if (preg_match('/^clickup-([A-Za-z0-9]+)$/', $id, $m) === 1) {
        return ['provider' => 'clickup', 'externalId' => $m[1], 'extra' => []];
    }
    if (preg_match('/^gcal-([A-Za-z0-9_-]+)$/', $id, $m) === 1) {
        return ['provider' => 'gcal', 'externalId' => $m[1], 'extra' => []];
    }
    if (preg_match('/^pos-refurb-([A-Za-z0-9_-]+)$/', $id, $m) === 1) {
        return ['provider' => 'pos', 'externalId' => $m[1], 'extra' => ['table' => 'refurb_tasks']];
    }
    if (preg_match('/^pos-([A-Za-z0-9_-]+)$/', $id, $m) === 1) {
        return ['provider' => 'pos', 'externalId' => $m[1], 'extra' => ['table' => 'tasks']];
    }
    if (preg_match('/^rem-([A-Za-z0-9_-]+)$/', $id, $m) === 1) {
        return ['provider' => 'reminders', 'externalId' => $m[1], 'extra' => []];
    }
    return null;
}

function text_clip(string $value, int $max): string
{
    if (text_length($value) <= $max) {
        return $value;
    }
    $cut = max(0, $max - 1);
    $short = function_exists('mb_substr') ? mb_substr($value, 0, $cut) : substr($value, 0, $cut);
    return $short . '…';
}

function notes_with_marker(string $body, string $marker): string
{
    $body = preg_replace('/\s*\[source:[^\]]*\]\s*$/', '', $body) ?? $body;
    $body = trim($body);
    $notes = $body === '' ? $marker : $body . "\n\n" . $marker;
    if (text_length($notes) <= 5000) {
        return $notes;
    }
    $keep = 5000 - text_length($marker) - 2;
    if ($keep < 0) {
        return text_clip($marker, 5000);
    }
    $body = function_exists('mb_substr') ? mb_substr($body, 0, $keep) : substr($body, 0, $keep);
    return rtrim($body) . "\n\n" . $marker;
}

function clickup_tag_for(string $spaceName, string $listName, array $settings): string
{
    $map = $settings['tagMap'] ?? [];
    if (!is_array($map)) {
        $map = [];
    }
    $names = [$listName, $spaceName];
    foreach ($map as $row) {
        if (!is_array($row)) {
            continue;
        }
        $match = trim((string) ($row['match'] ?? ''));
        $tag = (string) ($row['tag'] ?? '');
        if ($match === '' || !in_array($tag, TAGS, true)) {
            continue;
        }
        foreach ($names as $name) {
            if ($name !== '' && strcasecmp($name, $match) === 0) {
                return $tag;
            }
        }
    }
    foreach ($names as $name) {
        $folded = strtolower($name);
        if ($folded === 'the cellphone store' || str_contains($folded, 'cellphone store') || str_contains($folded, 'cell phone store')) {
            return 'cell-phone';
        }
    }
    $default = (string) ($settings['defaultTag'] ?? 'cell-phone');
    return in_array($default, TAGS, true) ? $default : 'cell-phone';
}

function clickup_priority_label(mixed $priority): string
{
    $name = '';
    if (is_array($priority)) {
        $name = strtolower((string) ($priority['priority'] ?? ''));
        if ($name === '' && isset($priority['id'])) {
            $name = (string) $priority['id'];
        }
    } elseif (is_string($priority) || is_int($priority)) {
        $name = strtolower((string) $priority);
    }
    return match ($name) {
        '1', 'urgent' => 'Urgent',
        '2', 'high' => 'High',
        '3', 'normal', 'medium' => 'Medium',
        '4', 'low' => 'Low',
        default => 'Medium',
    };
}

function clickup_status_label(array $status): array
{
    $type = strtolower((string) ($status['type'] ?? ''));
    $name = strtolower((string) ($status['status'] ?? ''));
    $closed = $type === 'closed' || $type === 'done' || in_array($name, ['closed', 'complete', 'completed', 'done'], true);
    if ($closed) {
        return ['Done', true];
    }
    if (str_contains($name, 'progress') || str_contains($name, 'doing')) {
        return ['In Progress', false];
    }
    if (str_contains($name, 'wait') || str_contains($name, 'hold') || str_contains($name, 'block')) {
        return ['Waiting', false];
    }
    return ['To Do', false];
}

function clickup_due(array $task): array
{
    $raw = $task['due_date'] ?? null;
    if ($raw === null || $raw === '' || $raw === '0') {
        return ['deadline' => null, 'allDay' => 0];
    }
    $ms = (int) $raw;
    if ($ms <= 0) {
        return ['deadline' => null, 'allDay' => 0];
    }
    $dt = (new DateTimeImmutable('@' . (int) floor($ms / 1000)))->setTimezone(new DateTimeZone('UTC'));
    if ($dt->format('H:i:s') === '00:00:00') {
        return ['deadline' => $dt->format('Y-m-d') . ' 12:00:00.000', 'allDay' => 1];
    }
    return ['deadline' => $dt->format('Y-m-d H:i:s.v'), 'allDay' => 0];
}

function pos_column_candidates(): array
{
    return [
        'id' => ['id', 'task_id', 'uuid'],
        'title' => ['title', 'name', 'summary', 'task_name', 'task'],
        'notes' => ['description', 'notes', 'details', 'body', 'note'],
        'due' => ['due_date', 'due_at', 'deadline', 'due'],
        'status' => ['status', 'state'],
        'completed' => ['completed', 'is_completed', 'done', 'is_done'],
        'assignee' => ['assigned_to', 'assignee', 'assignee_email', 'owner_email', 'user_email', 'email'],
        'priority' => ['priority', 'importance'],
    ];
}

function pos_empty_columns(): array
{
    $out = [];
    foreach (array_keys(pos_column_candidates()) as $field) {
        $out[$field] = null;
    }
    return $out;
}

function pos_guess_columns(array $columns): array
{
    $lower = [];
    foreach ($columns as $name) {
        if (is_string($name) && $name !== '') {
            $lower[strtolower($name)] = $name;
        }
    }
    $out = [];
    foreach (pos_column_candidates() as $field => $candidates) {
        $out[$field] = null;
        foreach ($candidates as $candidate) {
            if (isset($lower[$candidate])) {
                $out[$field] = $lower[$candidate];
                break;
            }
        }
    }
    return $out;
}

function pos_guess_from_row(array $row): array
{
    return pos_guess_columns(array_keys($row));
}

function pos_is_done(array $row, array $columns): bool
{
    $completed = $columns['completed'] ?? null;
    if (is_string($completed) && $completed !== '' && array_key_exists($completed, $row)) {
        $value = $row[$completed];
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value === 1;
        }
        if (is_string($value)) {
            $folded = strtolower(trim($value));
            if (in_array($folded, ['1', 'true', 't', 'yes', 'y', 'done', 'completed', 'complete', 'closed'], true)) {
                return true;
            }
            if (in_array($folded, ['0', 'false', 'f', 'no', 'n', '', 'open', 'todo', 'to do', 'pending'], true)) {
                return false;
            }
        }
    }
    $status = $columns['status'] ?? null;
    if (is_string($status) && $status !== '' && isset($row[$status])) {
        $folded = strtolower(trim((string) $row[$status]));
        if (in_array($folded, ['done', 'completed', 'complete', 'closed'], true)) {
            return true;
        }
    }
    return false;
}

function pos_open_status(array $row, array $columns): string
{
    if (pos_is_done($row, $columns)) {
        return 'Done';
    }
    $status = $columns['status'] ?? null;
    $folded = '';
    if (is_string($status) && $status !== '' && isset($row[$status])) {
        $folded = strtolower(trim((string) $row[$status]));
    }
    if (str_contains($folded, 'progress') || $folded === 'doing' || $folded === 'started') {
        return 'In Progress';
    }
    if (str_contains($folded, 'wait') || str_contains($folded, 'hold') || str_contains($folded, 'block')) {
        return 'Waiting';
    }
    return 'To Do';
}

function pos_priority(mixed $value): string
{
    $folded = strtolower(trim((string) $value));
    return match (true) {
        in_array($folded, ['1', 'urgent', 'critical'], true) => 'Urgent',
        in_array($folded, ['2', 'high'], true) => 'High',
        in_array($folded, ['4', 'low'], true) => 'Low',
        default => 'Medium',
    };
}

function pos_parse_due(mixed $value): array
{
    if ($value === null || $value === '') {
        return ['deadline' => null, 'allDay' => 0];
    }
    if (is_int($value) || is_float($value) || (is_string($value) && preg_match('/^\d{10,13}$/', $value) === 1)) {
        $n = (int) $value;
        if ($n > 100000000000) {
            $n = (int) round($n / 1000);
        }
        $dt = (new DateTimeImmutable('@' . $n))->setTimezone(new DateTimeZone('UTC'));
        return ['deadline' => $dt->format('Y-m-d H:i:s.v'), 'allDay' => 0];
    }
    if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
        return ['deadline' => $value . ' 12:00:00.000', 'allDay' => 1];
    }
    if (!is_string($value)) {
        return ['deadline' => null, 'allDay' => 0];
    }
    try {
        $dt = new DateTimeImmutable($value);
    } catch (Exception) {
        return ['deadline' => null, 'allDay' => 0];
    }
    return ['deadline' => $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v'), 'allDay' => 0];
}

function reminder_priority(?int $priority): string
{
    if ($priority === null || $priority === 0) {
        return 'Medium';
    }
    if ($priority <= 2) {
        return 'Urgent';
    }
    if ($priority <= 5) {
        return 'High';
    }
    if ($priority <= 7) {
        return 'Medium';
    }
    return 'Low';
}

function sync_public_error(Throwable $e): string
{
    $msg = $e->getMessage();
    $msg = preg_replace('/pk_[A-Za-z0-9_]+/', 'pk_…', $msg) ?? $msg;
    $msg = preg_replace('/eyJ[A-Za-z0-9_\-.]+/', '…', $msg) ?? $msg;
    $msg = preg_replace('/(Bearer\s+)\S+/i', '$1…', $msg) ?? $msg;
    $msg = preg_replace('/(app-specific password\s+)\S+/i', '$1…', $msg) ?? $msg;
    if (function_exists('text_length') && text_length($msg) > 400) {
        $msg = text_clip($msg, 400);
    } elseif (strlen($msg) > 400) {
        $msg = substr($msg, 0, 399) . '…';
    }
    return $msg === '' ? 'Sync failed.' : $msg;
}

function column_name_ok(?string $name): bool
{
    if ($name === null || $name === '') {
        return false;
    }
    return preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/', $name) === 1;
}
