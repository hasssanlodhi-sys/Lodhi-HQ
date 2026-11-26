<?php

declare(strict_types=1);

/**
 * Local checks for calendar parsing, id mapping, and (when MySQL is reachable)
 * upserting imported rows. No network calls.
 *
 *   php scripts/test-sync.php
 */

require dirname(__DIR__) . '/api/lib/bootstrap.php';
require dirname(__DIR__) . '/api/lib/auth.php';
require dirname(__DIR__) . '/api/lib/repository.php';
require dirname(__DIR__) . '/api/lib/load_integrations.php';

putenv('LODHI_APP_KEY=test-key-0123456789abcdef');

$failed = 0;
$passed = 0;

function check(bool $ok, string $label): void
{
    global $failed, $passed;
    if ($ok) {
        $passed++;
        echo "ok  $label\n";
        return;
    }
    $failed++;
    echo "FAIL $label\n";
}

$now = new DateTimeImmutable('2026-11-26T15:00:00Z');

$daily = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abcdef@google.com
SUMMARY:Store open
DTSTART:20260101T140000Z
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR
ICS;
$dailyEvents = ics_expand_events($daily, $now);
check(count($dailyEvents) === 1, 'daily RRULE stays one task');
check($dailyEvents[0]['daily'] === true && $dailyEvents[0]['stamp'] === null, 'daily task has no occurrence stamp');
check($dailyEvents[0]['start']['utc']->format('Y-m-d H:i') === '2026-11-26 14:00', 'daily deadline is today at the event time');
$dailyIds = gcal_task_ids('abcdef@google.com', null, 'muhammad');
check($dailyIds['canonical'] === 'gcal-abcdef', 'Google UID drops @google.com');

$weekly = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:week123@google.com
SUMMARY:Shift
DTSTART:20261102T150000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
EXDATE:20261125T150000Z
END:VEVENT
END:VCALENDAR
ICS;
$weeklyEvents = ics_expand_events($weekly, $now);
check(count($weeklyEvents) > 8, 'weekly BYDAY expands inside the window');
$weekdays = [];
$sawExcluded = false;
$stampsOk = true;
foreach ($weeklyEvents as $event) {
    $weekdays[(int) $event['start']['utc']->format('N')] = true;
    if ($event['start']['utc']->format('Ymd') === '20261125') {
        $sawExcluded = true;
    }
    if ($event['daily'] !== false || !is_string($event['stamp']) || !str_ends_with((string) $event['stamp'], 'Z')) {
        $stampsOk = false;
    }
}
check($stampsOk, 'weekly occurrences have UTC stamps');
$seenDays = array_keys($weekdays);
sort($seenDays);
check($seenDays === [1, 3, 5], 'weekly occurrences are Mon Wed Fri');
check($sawExcluded === false, 'EXDATE drops 25 Nov 2026');
$sampleStamp = (string) $weeklyEvents[0]['stamp'];
check(gcal_task_ids('week123@google.com', $sampleStamp, 'muhammad')['canonical'] === 'gcal-week123_' . preg_replace('/[^A-Za-z0-9]/', '', $sampleStamp), 'occurrence id matches gcal-<uid>_<stamp>');

$folded = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold@google.com\r\nSUMMARY:Hi\r\nDESCRIPTION:Hello\\nWor\r\n ld\r\nDTSTART:20261126T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
$foldedEvents = ics_expand_events($folded, $now);
check(count($foldedEvents) === 1 && $foldedEvents[0]['description'] === "Hello\nWorld", 'folded description is unescaped');

$cancelled = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:gone@google.com
SUMMARY:Cancelled
STATUS:CANCELLED
DTSTART:20261126T170000Z
END:VEVENT
END:VCALENDAR
ICS;
check(ics_expand_events($cancelled, $now) === [], 'cancelled events are skipped');

$old = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:old@google.com
SUMMARY:Old
DTSTART:20200101T120000Z
END:VEVENT
END:VCALENDAR
ICS;
check(ics_expand_events($old, $now) === [], 'events outside the window are skipped');

$ended = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ended@google.com
SUMMARY:Ended
DTSTART:20261120T140000Z
RRULE:FREQ=DAILY;COUNT=3
END:VEVENT
END:VCALENDAR
ICS;
check(ics_expand_events($ended, $now) === [], 'a finished daily count is not imported');

$allDay = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday@google.com
SUMMARY:Delivery
DTSTART;VALUE=DATE:20261126
END:VEVENT
END:VCALENDAR
ICS;
$allDayEvents = ics_expand_events($allDay, $now);
check(count($allDayEvents) === 1 && $allDayEvents[0]['start']['allDay'] === true, 'all-day VALUE=DATE is recognized');
check(ics_deadline($allDayEvents[0]['start'])['deadline'] === '2026-11-26 12:00:00.000', 'all-day deadline stays on that calendar date');

$vtodo = <<<'ICS'
BEGIN:VCALENDAR
BEGIN:VTODO
UID:rem-1
SUMMARY:Call vendor
STATUS:NEEDS-ACTION
PRIORITY:1
END:VTODO
BEGIN:VTODO
UID:rem-done
SUMMARY:Done already
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
ICS;
$todos = ics_vtodos($vtodo);
check(count($todos) === 1 && $todos[0]['summary'] === 'Call vendor', 'completed VTODOs are left out');
check(reminder_priority(1) === 'Urgent', 'Apple priority 1 is Urgent');
$completedIcs = ics_complete_vtodo("BEGIN:VCALENDAR\nBEGIN:VTODO\nUID:rem-1\nSUMMARY:Call vendor\nEND:VTODO\nEND:VCALENDAR\n");
check(str_contains($completedIcs, 'STATUS:COMPLETED') && str_contains($completedIcs, 'PERCENT-COMPLETE:100'), 'completing a VTODO sets STATUS and percent');

check(clickup_tag_for('The Cellphone Store', 'Front', []) === 'cell-phone', 'Cellphone Store maps to cell-phone by default');
check(clickup_tag_for('Other', 'Front', ['tagMap' => [['match' => 'Front', 'tag' => 'tax']], 'defaultTag' => 'personal']) === 'tax', 'list name wins over the default tag');
check(clickup_tag_for('Warehouse', 'Bin', ['defaultTag' => 'essentials']) === 'essentials', 'unmapped ClickUp space uses the default tag');
check(clickup_priority_label(['priority' => 'urgent']) === 'Urgent', 'ClickUp urgent priority');
[$clickStatus, $clickClosed] = clickup_status_label(['status' => 'complete', 'type' => 'closed']);
check($clickStatus === 'Done' && $clickClosed === true, 'ClickUp closed type is Done');
check(clickup_task_ids('86abc')['canonical'] === 'clickup-86abc', 'ClickUp id keeps the imported prefix');

$guess = pos_guess_columns(['id', 'name', 'notes', 'due_at', 'is_completed', 'assigned_to', 'priority']);
check($guess['title'] === 'name' && $guess['due'] === 'due_at' && $guess['completed'] === 'is_completed' && $guess['assignee'] === 'assigned_to', 'POS columns are guessed from common names');
check(pos_is_done(['is_completed' => false, 'status' => 'open'], $guess) === false, 'open POS row is not done');
check(pos_is_done(['is_completed' => true], $guess) === true, 'boolean completed column is done');
check(pos_open_status(['status' => 'in_progress'], ['status' => 'status', 'completed' => null]) === 'In Progress', 'POS in_progress maps to In Progress');
check(pos_parse_due('2026-11-26')['allDay'] === 1, 'date-only POS due dates are all-day');

$marker = source_marker('clickup', '86abc', ['list' => '999']);
$identity = synced_identity(['id' => 'task_custom', 'notes' => "Bring stock\n\n" . $marker]);
check($identity !== null && $identity['provider'] === 'clickup' && $identity['externalId'] === '86abc' && ($identity['extra']['list'] ?? '') === '999', 'source marker keeps the ClickUp id and list');
$legacy = synced_identity(['id' => 'clickup-86abc', 'notes' => 'older import']);
check($legacy !== null && $legacy['provider'] === 'clickup' && $legacy['externalId'] === '86abc', 'legacy clickup- id is recognized without a marker');
$gcalLegacy = synced_identity(['id' => 'gcal-abcdef', 'notes' => 'note [source: gcal:abcdef]']);
check($gcalLegacy !== null && $gcalLegacy['provider'] === 'gcal' && $gcalLegacy['externalId'] === 'abcdef', 'legacy gcal marker is recognized');
$notes = notes_with_marker("Bring stock\n\n[source: clickup:old]", $marker);
check(substr_count($notes, '[source:') === 1 && str_ends_with($notes, $marker), 'notes keep a single marker at the end');

$cipher = secret_encrypt('pk_secret_value');
check(secret_decrypt($cipher) === 'pk_secret_value' && !str_contains($cipher, 'pk_secret_value'), 'secrets round-trip and are not stored in clear text');
check(str_contains(sync_public_error(new RuntimeException('bad pk_abcdefghijklmnopqrstuvwxyz')), 'pk_…'), 'errors do not keep a token');

try {
    http_assert_https_host('https://calendar.google.com/calendar/ical/x/basic.ics', ['calendar.google.com']);
    $allowed = true;
} catch (Throwable) {
    $allowed = false;
}
check($allowed, 'Google calendar host is allowed');
$blocked = false;
try {
    http_assert_https_host('http://127.0.0.1/secret.ics', ['calendar.google.com']);
} catch (Throwable) {
    $blocked = true;
}
check($blocked, 'plain http and IP addresses are rejected');

function test_pdo(): ?PDO
{
    $sql = "CREATE DATABASE IF NOT EXISTS lodhi_sync_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; "
        . "CREATE USER IF NOT EXISTS 'lodhi_test'@'127.0.0.1' IDENTIFIED BY 'lodhi_test'; "
        . "CREATE USER IF NOT EXISTS 'lodhi_test'@'localhost' IDENTIFIED BY 'lodhi_test'; "
        . "GRANT ALL PRIVILEGES ON lodhi_sync_test.* TO 'lodhi_test'@'127.0.0.1'; "
        . "GRANT ALL PRIVILEGES ON lodhi_sync_test.* TO 'lodhi_test'@'localhost'; "
        . "FLUSH PRIVILEGES;";
    @exec('sudo mysql -e ' . escapeshellarg($sql));
    $attempts = [
        ['mysql:host=127.0.0.1;dbname=lodhi_sync_test;charset=utf8mb4', 'lodhi_test', 'lodhi_test'],
        ['mysql:unix_socket=/run/mysqld/mysqld.sock;dbname=lodhi_sync_test;charset=utf8mb4', 'lodhi_test', 'lodhi_test'],
    ];
    foreach ($attempts as [$dsn, $user, $pass]) {
        try {
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
            foreach (['tasks', 'check_ins', 'rewards', 'login_attempts', 'settings', 'integrations', 'schema_migrations', 'users'] as $table) {
                $pdo->exec('DROP TABLE IF EXISTS `' . $table . '`');
            }
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
            $pdo->exec("SET time_zone = '+00:00'");
            return $pdo;
        } catch (Throwable) {
            continue;
        }
    }
    return null;
}

$pdo = test_pdo();
if (!$pdo) {
    echo "skip database upsert checks (MySQL root is not reachable)\n";
} else {
    $GLOBALS['lodhi_test_pdo'] = $pdo;
    $schema = file_get_contents(dirname(__DIR__) . '/api/schema.sql');
    run_sql_script($schema === false ? '' : $schema);
    $nowSql = mysql_now();
    q(
        'INSERT INTO users (id, email, password_hash, name, job_title, account_role, business_tags, contact, active, must_change_password, session_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)',
        ['muhammad', 'owner@lodhi.test', 'hash', 'Muhammad', 'Owner', 'owner', '[]', '', $nowSql, $nowSql]
    );
    q(
        'INSERT INTO tasks (id, title, tag, deadline, all_day, priority, assignee_id, status, estimated_time, notes, completed_at, on_time, recurrence, helped_member_id, created_at)
         VALUES (?, ?, ?, NULL, 0, ?, ?, ?, 30, ?, NULL, NULL, NULL, NULL, ?)',
        ['task_oldclick', 'Old title', 'personal', 'Medium', 'muhammad', 'To Do', "Do it\n\n[source: clickup:zz99]", $nowSql]
    );
    $updated = apply_synced_task([
        'provider' => 'clickup',
        'externalId' => 'zz99',
        'candidateIds' => ['clickup-zz99'],
        'canonicalId' => 'clickup-zz99',
        'userId' => 'muhammad',
        'title' => 'New title',
        'tag' => 'cell-phone',
        'deadline' => null,
        'allDay' => 0,
        'priority' => 'High',
        'assigneeId' => 'muhammad',
        'status' => 'To Do',
        'remoteClosed' => false,
        'estimatedTime' => 30,
        'notesBody' => 'Do it',
        'marker' => source_marker('clickup', 'zz99', ['list' => '55']),
        'recurrence' => null,
        'twoWay' => true,
    ]);
    $count = (int) q('SELECT COUNT(*) FROM tasks')->fetchColumn();
    $row = task_by_id('task_oldclick');
    check($updated['action'] === 'updated' && $count === 1 && $row && $row['title'] === 'New title' && $row['tag'] === 'cell-phone', 'existing ClickUp row is updated instead of duplicated');
    check($row && str_contains((string) $row['notes'], '[source: clickup:zz99 list:55]'), 'updated notes end with the ClickUp marker');

    q("UPDATE tasks SET status = 'Done', completed_at = ? WHERE id = ?", [$nowSql, 'task_oldclick']);
    $push = apply_synced_task([
        'provider' => 'clickup',
        'externalId' => 'zz99',
        'candidateIds' => ['clickup-zz99'],
        'canonicalId' => 'clickup-zz99',
        'userId' => 'muhammad',
        'title' => 'New title',
        'tag' => 'cell-phone',
        'deadline' => null,
        'allDay' => 0,
        'priority' => 'High',
        'assigneeId' => 'muhammad',
        'status' => 'To Do',
        'remoteClosed' => false,
        'estimatedTime' => 30,
        'notesBody' => 'Do it',
        'marker' => source_marker('clickup', 'zz99', ['list' => '55']),
        'recurrence' => null,
        'twoWay' => true,
    ]);
    $done = task_by_id('task_oldclick');
    check($push['needsPush'] === true && $done && $done['status'] === 'Done' && (int) q('SELECT COUNT(*) FROM tasks')->fetchColumn() === 1, 'a local completion stays Done and asks to close ClickUp');

    q(
        'INSERT INTO tasks (id, title, tag, deadline, all_day, priority, assignee_id, status, estimated_time, notes, completed_at, on_time, recurrence, helped_member_id, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, 30, ?, ?, 1, ?, NULL, ?)',
        ['gcal-daily1', 'Open', 'personal', '2026-11-25 14:00:00.000', 'Medium', 'muhammad', 'Done', '[source: gcal:daily1 user:muhammad]', '2026-11-25 18:00:00.000', 'daily', $nowSql]
    );
    $reopened = apply_synced_task([
        'provider' => 'gcal',
        'externalId' => 'daily1',
        'candidateIds' => ['gcal-daily1'],
        'canonicalId' => 'gcal-daily1',
        'userId' => 'muhammad',
        'title' => 'Open',
        'tag' => 'personal',
        'deadline' => '2026-11-26 14:00:00.000',
        'allDay' => 0,
        'priority' => 'Medium',
        'assigneeId' => 'muhammad',
        'status' => 'To Do',
        'remoteClosed' => false,
        'estimatedTime' => 30,
        'notesBody' => '',
        'marker' => source_marker('gcal', 'daily1', ['user' => 'muhammad']),
        'recurrence' => 'daily',
        'timezone' => 'UTC',
        'twoWay' => false,
    ]);
    $live = task_by_id('gcal-daily1');
    $snapshots = (int) q("SELECT COUNT(*) FROM tasks WHERE id LIKE 'gcal-daily1-d%'")->fetchColumn();
    check($reopened['action'] === 'updated' && $live && $live['status'] === 'To Do' && $snapshots === 1, 'a completed daily calendar task reopens the next day and keeps a snapshot');

    $ran = run_migrations();
    $again = run_migrations();
    check($ran === ['001_integrations.sql'] && $again === [], 'migration 001 applies once');
    $ready = (int) q("SELECT COUNT(*) FROM integrations")->fetchColumn();
    check($ready === 0, 'integrations table exists after migration');
}

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
