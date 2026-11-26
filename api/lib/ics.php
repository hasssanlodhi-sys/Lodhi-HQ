<?php

declare(strict_types=1);

/**
 * Small iCalendar reader. Google secret-address feeds are VEVENT.
 * Apple Reminders over CalDAV are VTODO. RRULE support covers the
 * common daily, weekly, monthly, and yearly cases, plus EXDATE.
 */

function ics_unfold_lines(string $raw): array
{
    $raw = str_replace("\r\n", "\n", $raw);
    $raw = str_replace("\r", "\n", $raw);
    $lines = explode("\n", $raw);
    $out = [];
    foreach ($lines as $line) {
        if ($out !== [] && $line !== '' && ($line[0] === ' ' || $line[0] === "\t")) {
            $out[count($out) - 1] .= substr($line, 1);
            continue;
        }
        $out[] = $line;
    }
    return $out;
}

function ics_unescape(string $value): string
{
    $value = str_replace(['\\n', '\\N'], "\n", $value);
    return str_replace(['\\,', '\\;', '\\\\'], [',', ';', '\\'], $value);
}

function ics_parse_property(string $line): ?array
{
    $line = rtrim($line, "\r");
    if ($line === '' || str_starts_with($line, '#')) {
        return null;
    }
    $colon = strpos($line, ':');
    if ($colon === false) {
        return null;
    }
    $left = substr($line, 0, $colon);
    $value = substr($line, $colon + 1);
    $parts = explode(';', $left);
    $name = strtoupper(trim($parts[0]));
    if ($name === '') {
        return null;
    }
    $params = [];
    for ($i = 1, $n = count($parts); $i < $n; $i++) {
        $eq = strpos($parts[$i], '=');
        if ($eq === false) {
            continue;
        }
        $params[strtoupper(substr($parts[$i], 0, $eq))] = trim(substr($parts[$i], $eq + 1), '"');
    }
    return ['name' => $name, 'params' => $params, 'value' => $value];
}

function ics_parse_components(string $ics, string $kind): array
{
    $kind = strtoupper($kind);
    $lines = ics_unfold_lines($ics);
    $items = [];
    $collecting = false;
    $nested = 0;
    $props = [];
    foreach ($lines as $line) {
        $prop = ics_parse_property($line);
        if (!$prop) {
            continue;
        }
        if ($prop['name'] === 'BEGIN') {
            $type = strtoupper(trim($prop['value']));
            if (!$collecting && $type === $kind) {
                $collecting = true;
                $nested = 0;
                $props = [];
                continue;
            }
            if ($collecting) {
                $nested++;
            }
            continue;
        }
        if ($prop['name'] === 'END') {
            if ($collecting && $nested > 0) {
                $nested--;
                continue;
            }
            if ($collecting && strtoupper(trim($prop['value'])) === $kind) {
                $items[] = ics_component_from_props($props);
                $collecting = false;
            }
            continue;
        }
        if ($collecting && $nested === 0) {
            $props[] = $prop;
        }
    }
    return $items;
}

function ics_component_from_props(array $props): array
{
    $first = static function (string $name) use ($props): ?array {
        foreach ($props as $prop) {
            if ($prop['name'] === $name) {
                return $prop;
            }
        }
        return null;
    };
    $text = static function (?array $prop): string {
        return $prop ? trim(ics_unescape($prop['value'])) : '';
    };
    $uid = $first('UID');
    $summary = $first('SUMMARY');
    $description = $first('DESCRIPTION');
    $status = $first('STATUS');
    $rrule = $first('RRULE');
    $priority = $first('PRIORITY');
    $percent = $first('PERCENT-COMPLETE');
    $dtstart = $first('DTSTART');
    $dtend = $first('DTEND');
    $due = $first('DUE');
    $completed = $first('COMPLETED');
    $recurrence = $first('RECURRENCE-ID');
    $exdates = [];
    foreach ($props as $prop) {
        if ($prop['name'] !== 'EXDATE') {
            continue;
        }
        foreach (explode(',', $prop['value']) as $piece) {
            $piece = trim($piece);
            if ($piece === '') {
                continue;
            }
            $parsed = ics_parse_when(['params' => $prop['params'], 'value' => $piece]);
            if ($parsed) {
                $exdates[] = $parsed;
            }
        }
    }
    $priorityValue = null;
    if ($priority && is_numeric(trim($priority['value']))) {
        $priorityValue = (int) trim($priority['value']);
    }
    $percentValue = null;
    if ($percent && is_numeric(trim($percent['value']))) {
        $percentValue = (int) trim($percent['value']);
    }
    return [
        'uid' => $text($uid),
        'summary' => $text($summary),
        'description' => $text($description),
        'status' => strtoupper($text($status)),
        'priority' => $priorityValue,
        'percent' => $percentValue,
        'start' => $dtstart ? ics_parse_when($dtstart) : null,
        'end' => $dtend ? ics_parse_when($dtend) : null,
        'due' => $due ? ics_parse_when($due) : null,
        'completed' => $completed ? ics_parse_when($completed) : null,
        'recurrenceId' => $recurrence ? ics_parse_when($recurrence) : null,
        'rrule' => $rrule ? ics_parse_rrule($rrule['value']) : null,
        'exdates' => $exdates,
    ];
}

function ics_parse_when(array $prop): ?array
{
    $value = trim((string) ($prop['value'] ?? ''));
    if ($value === '') {
        return null;
    }
    $params = $prop['params'] ?? [];
    $tzid = trim((string) ($params['TZID'] ?? ''), '"');
    $allDay = strtoupper((string) ($params['VALUE'] ?? '')) === 'DATE' || preg_match('/^\d{8}$/', $value) === 1;
    try {
        if ($allDay) {
            $dt = DateTimeImmutable::createFromFormat('!Ymd', substr($value, 0, 8), new DateTimeZone('UTC'));
            if (!$dt) {
                return null;
            }
            return ['utc' => $dt, 'allDay' => true, 'tz' => $tzid !== '' ? $tzid : 'UTC', 'local' => $dt];
        }
        $utc = str_ends_with($value, 'Z');
        $bare = rtrim($value, 'Z');
        if (preg_match('/^\d{8}T\d{6}$/', $bare) !== 1) {
            return null;
        }
        if ($utc || $tzid === '') {
            $dt = DateTimeImmutable::createFromFormat('!Ymd\THis', $bare, new DateTimeZone('UTC'));
            if (!$dt) {
                return null;
            }
            return ['utc' => $dt, 'allDay' => false, 'tz' => 'UTC', 'local' => $dt];
        }
        try {
            $zone = new DateTimeZone($tzid);
        } catch (Exception) {
            $zone = new DateTimeZone('UTC');
            $tzid = 'UTC';
        }
        $local = DateTimeImmutable::createFromFormat('!Ymd\THis', $bare, $zone);
        if (!$local) {
            return null;
        }
        return [
            'utc' => $local->setTimezone(new DateTimeZone('UTC')),
            'allDay' => false,
            'tz' => $tzid,
            'local' => $local,
        ];
    } catch (Exception) {
        return null;
    }
}

function ics_parse_rrule(string $value): array
{
    $out = [];
    foreach (explode(';', $value) as $part) {
        $eq = strpos($part, '=');
        if ($eq === false) {
            continue;
        }
        $out[strtoupper(substr($part, 0, $eq))] = substr($part, $eq + 1);
    }
    return $out;
}

function ics_plain_daily(array $rrule): bool
{
    if (strtoupper((string) ($rrule['FREQ'] ?? '')) !== 'DAILY') {
        return false;
    }
    if ((int) ($rrule['INTERVAL'] ?? 1) !== 1) {
        return false;
    }
    foreach (['BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR'] as $key) {
        if (!empty($rrule[$key])) {
            return false;
        }
    }
    return true;
}

function ics_stamp(array $when): string
{
    if ($when['allDay']) {
        return $when['local']->format('Ymd');
    }
    return $when['utc']->format('Ymd\THis\Z');
}

function ics_weekday_code(DateTimeImmutable $day): string
{
    return ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][(int) $day->format('N') - 1];
}

function ics_parse_until(string $value): ?array
{
    return ics_parse_when(['params' => [], 'value' => trim($value)]);
}

function ics_same_moment(array $a, array $b): bool
{
    if (!empty($a['allDay']) || !empty($b['allDay'])) {
        return $a['utc']->format('Ymd') === $b['utc']->format('Ymd');
    }
    return $a['utc']->format('Ymd\THis') === $b['utc']->format('Ymd\THis');
}

function ics_is_exdate(array $when, array $exdates): bool
{
    foreach ($exdates as $exdate) {
        if (ics_same_moment($when, $exdate)) {
            return true;
        }
    }
    return false;
}

function ics_zone(array $start): DateTimeZone
{
    $name = (string) ($start['tz'] ?? 'UTC');
    try {
        return new DateTimeZone($name !== '' ? $name : 'UTC');
    } catch (Exception) {
        return new DateTimeZone('UTC');
    }
}

function ics_daily_occurrence(array $start, array $rrule, DateTimeImmutable $nowUtc): ?array
{
    $zone = ics_zone($start);
    $localStart = $start['local']->setTimezone($zone);
    $nowLocal = $nowUtc->setTimezone($zone);
    $candidate = $nowLocal->setTime((int) $localStart->format('H'), (int) $localStart->format('i'), (int) $localStart->format('s'));
    if (!empty($start['allDay'])) {
        $candidate = $nowLocal->setTime(0, 0);
    }
    if ($candidate < $localStart) {
        $candidate = $localStart;
    }
    $until = !empty($rrule['UNTIL']) ? ics_parse_until((string) $rrule['UNTIL']) : null;
    if ($until && $candidate->setTimezone(new DateTimeZone('UTC')) > $until['utc']) {
        return null;
    }
    $count = isset($rrule['COUNT']) ? (int) $rrule['COUNT'] : null;
    if ($count !== null) {
        $days = (int) $localStart->setTime(0, 0)->diff($candidate->setTime(0, 0))->days;
        if ($candidate->format('Ymd') < $localStart->format('Ymd') || $days >= $count) {
            return null;
        }
    }
    if ($candidate > $nowLocal->modify('+60 days') || $candidate < $nowLocal->modify('-7 days')) {
        return null;
    }
    return [
        'utc' => $candidate->setTimezone(new DateTimeZone('UTC')),
        'allDay' => (bool) $start['allDay'],
        'tz' => $zone->getName(),
        'local' => $candidate,
    ];
}

function ics_month_byday_match(DateTimeImmutable $cursor, array $byday): bool
{
    $code = ics_weekday_code($cursor);
    $day = (int) $cursor->format('j');
    $ordinal = intdiv($day - 1, 7) + 1;
    $last = (int) $cursor->format('t');
    $fromEnd = -(intdiv($last - $day, 7) + 1);
    foreach ($byday as $token) {
        if (preg_match('/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/', $token, $m) !== 1) {
            continue;
        }
        if ($m[2] !== $code) {
            continue;
        }
        if ($m[1] === '') {
            return true;
        }
        $n = (int) $m[1];
        if ($n === $ordinal || $n === $fromEnd) {
            return true;
        }
    }
    return false;
}

function ics_rule_match(DateTimeImmutable $start, DateTimeImmutable $cursor, string $freq, int $interval, array $byday, array $bymonthday): bool
{
    if ($cursor->format('Ymd') < $start->format('Ymd')) {
        return false;
    }
    if ($freq === 'DAILY') {
        $days = (int) $start->setTime(0, 0)->diff($cursor->setTime(0, 0))->days;
        return $days % $interval === 0;
    }
    if ($freq === 'WEEKLY') {
        $startMonday = $start->modify('-' . ((int) $start->format('N') - 1) . ' days')->setTime(0, 0);
        $cursorMonday = $cursor->modify('-' . ((int) $cursor->format('N') - 1) . ' days')->setTime(0, 0);
        $weeks = (int) round($startMonday->diff($cursorMonday)->days / 7);
        if ($weeks % $interval !== 0) {
            return false;
        }
        $code = ics_weekday_code($cursor);
        if ($byday === []) {
            return $code === ics_weekday_code($start);
        }
        foreach ($byday as $day) {
            $plain = preg_replace('/^[+-]?\d+/', '', $day) ?? $day;
            if ($plain === $code) {
                return true;
            }
        }
        return false;
    }
    if ($freq === 'MONTHLY') {
        $months = ((int) $cursor->format('Y') - (int) $start->format('Y')) * 12 + ((int) $cursor->format('n') - (int) $start->format('n'));
        if ($months < 0 || $months % $interval !== 0) {
            return false;
        }
        if ($bymonthday !== []) {
            return in_array((int) $cursor->format('j'), $bymonthday, true);
        }
        if ($byday !== []) {
            return ics_month_byday_match($cursor, $byday);
        }
        return (int) $cursor->format('j') === (int) $start->format('j');
    }
    if ($freq === 'YEARLY') {
        $years = (int) $cursor->format('Y') - (int) $start->format('Y');
        if ($years < 0 || $years % $interval !== 0) {
            return false;
        }
        return $cursor->format('m-d') === $start->format('m-d');
    }
    return false;
}

function ics_expand_rule(array $start, array $rrule, array $exdates, DateTimeImmutable $windowStart, DateTimeImmutable $windowEnd): array
{
    $freq = strtoupper((string) ($rrule['FREQ'] ?? ''));
    if (!in_array($freq, ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], true)) {
        $utc = $start['utc'];
        if ($utc >= $windowStart && $utc <= $windowEnd && !ics_is_exdate($start, $exdates)) {
            return [$start];
        }
        return [];
    }
    $interval = max(1, (int) ($rrule['INTERVAL'] ?? 1));
    $count = isset($rrule['COUNT']) ? max(0, (int) $rrule['COUNT']) : null;
    $until = !empty($rrule['UNTIL']) ? ics_parse_until((string) $rrule['UNTIL']) : null;
    $byday = [];
    if (!empty($rrule['BYDAY'])) {
        foreach (explode(',', strtoupper((string) $rrule['BYDAY'])) as $piece) {
            $piece = trim($piece);
            if ($piece !== '') {
                $byday[] = $piece;
            }
        }
    }
    $bymonthday = [];
    if (!empty($rrule['BYMONTHDAY'])) {
        foreach (explode(',', (string) $rrule['BYMONTHDAY']) as $piece) {
            if (is_numeric(trim($piece))) {
                $bymonthday[] = (int) trim($piece);
            }
        }
    }
    $zone = ics_zone($start);
    $cursor = $start['local']->setTimezone($zone);
    $limit = $windowEnd->setTimezone($zone)->modify('+1 day');
    $seen = 0;
    $emitted = [];
    $guard = 0;
    $hour = (int) $cursor->format('H');
    $minute = (int) $cursor->format('i');
    $second = (int) $cursor->format('s');
    while ($cursor <= $limit && $guard < 20000) {
        $guard++;
        if ($until && $cursor->setTimezone(new DateTimeZone('UTC')) > $until['utc']) {
            break;
        }
        if (ics_rule_match($start['local']->setTimezone($zone), $cursor, $freq, $interval, $byday, $bymonthday)) {
            $seen++;
            if ($count !== null && $seen > $count) {
                break;
            }
            $when = [
                'utc' => $cursor->setTimezone(new DateTimeZone('UTC')),
                'allDay' => (bool) $start['allDay'],
                'tz' => $zone->getName(),
                'local' => $cursor,
            ];
            if ($when['utc'] >= $windowStart && $when['utc'] <= $windowEnd && !ics_is_exdate($when, $exdates)) {
                $emitted[] = $when;
            }
            if (count($emitted) > 200) {
                break;
            }
        }
        $cursor = $cursor->modify('+1 day')->setTime($hour, $minute, $second);
    }
    return $emitted;
}

function ics_occurrence_row(array $master, array $when, bool $daily, ?string $stamp): array
{
    return [
        'uid' => $master['uid'],
        'summary' => $master['summary'],
        'description' => $master['description'],
        'status' => $master['status'],
        'priority' => $master['priority'],
        'percent' => $master['percent'],
        'start' => $when,
        'end' => $master['end'],
        'due' => $master['due'],
        'daily' => $daily,
        'stamp' => $daily ? null : $stamp,
    ];
}

function ics_expand_events(string $ics, DateTimeImmutable $now, string $kind = 'VEVENT'): array
{
    $now = $now->setTimezone(new DateTimeZone('UTC'));
    $windowStart = $now->modify('-7 days');
    $windowEnd = $now->modify('+60 days');
    $items = ics_parse_components($ics, $kind);
    $masters = [];
    $exceptions = [];
    foreach ($items as $item) {
        if ($item['uid'] === '') {
            continue;
        }
        if ($item['recurrenceId']) {
            $exceptions[] = $item;
        } else {
            $masters[] = $item;
        }
    }
    $out = [];
    foreach ($masters as $master) {
        if ($master['status'] === 'CANCELLED') {
            continue;
        }
        $start = $master['start'] ?? $master['due'];
        if (!$start) {
            continue;
        }
        $related = [];
        foreach ($exceptions as $exception) {
            if ($exception['uid'] === $master['uid']) {
                $related[] = $exception;
            }
        }
        if (is_array($master['rrule']) && ics_plain_daily($master['rrule'])) {
            $occurrence = ics_daily_occurrence($start, $master['rrule'], $now);
            if ($occurrence && !ics_is_exdate($occurrence, $master['exdates'])) {
                $out[] = ics_occurrence_row($master, $occurrence, true, null);
            }
            continue;
        }
        $times = is_array($master['rrule'])
            ? ics_expand_rule($start, $master['rrule'], $master['exdates'], $windowStart, $windowEnd)
            : (($start['utc'] >= $windowStart && $start['utc'] <= $windowEnd && !ics_is_exdate($start, $master['exdates'])) ? [$start] : []);
        foreach ($times as $when) {
            $row = $master;
            $skip = false;
            foreach ($related as $exception) {
                if (!$exception['recurrenceId'] || !ics_same_moment($exception['recurrenceId'], $when)) {
                    continue;
                }
                if ($exception['status'] === 'CANCELLED') {
                    $skip = true;
                    break;
                }
                if ($exception['summary'] !== '') {
                    $row['summary'] = $exception['summary'];
                }
                if ($exception['description'] !== '') {
                    $row['description'] = $exception['description'];
                }
                if ($exception['start']) {
                    $when = $exception['start'];
                }
            }
            if ($skip) {
                continue;
            }
            $stamp = is_array($master['rrule']) ? ics_stamp($when) : null;
            $out[] = ics_occurrence_row($row, $when, false, $stamp);
        }
    }
    return $out;
}

function ics_vtodos(string $ics): array
{
    $out = [];
    foreach (ics_parse_components($ics, 'VTODO') as $item) {
        if ($item['uid'] === '' || $item['recurrenceId']) {
            continue;
        }
        if ($item['status'] === 'COMPLETED' || $item['status'] === 'CANCELLED') {
            continue;
        }
        if ($item['percent'] !== null && $item['percent'] >= 100) {
            continue;
        }
        $out[] = $item;
    }
    return $out;
}

function ics_complete_vtodo(string $ics): string
{
    $normalized = str_replace("\r\n", "\n", $ics);
    $normalized = str_replace("\r", "\n", $normalized);
    $now = gmdate('Ymd\THis\Z');
    $set = static function (string $text, string $name, string $value): string {
        if (preg_match('/^' . $name . ':.*$/mi', $text) === 1) {
            return preg_replace('/^' . $name . ':.*$/mi', $name . ':' . $value, $text, 1) ?? $text;
        }
        return preg_replace('/^END:VTODO/mi', $name . ':' . $value . "\nEND:VTODO", $text, 1) ?? $text;
    };
    $normalized = $set($normalized, 'STATUS', 'COMPLETED');
    $normalized = $set($normalized, 'PERCENT-COMPLETE', '100');
    $normalized = $set($normalized, 'COMPLETED', $now);
    return str_replace("\n", "\r\n", $normalized);
}

function ics_deadline(array $when): array
{
    if (!empty($when['allDay'])) {
        return ['deadline' => $when['local']->format('Y-m-d') . ' 12:00:00.000', 'allDay' => 1];
    }
    return ['deadline' => $when['utc']->format('Y-m-d H:i:s.v'), 'allDay' => 0];
}

function ics_estimate_minutes(?array $start, ?array $end, bool $allDay): int
{
    if ($allDay || !$start || !$end) {
        return 30;
    }
    $mins = (int) round(($end['utc']->getTimestamp() - $start['utc']->getTimestamp()) / 60);
    if ($mins < 15) {
        return 15;
    }
    if ($mins > 480) {
        return 480;
    }
    return $mins;
}
