<?php

declare(strict_types=1);

function task_json(array $row): array
{
    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'tag' => $row['tag'],
        'deadline' => iso_from_mysql($row['deadline']),
        'allDay' => (int) $row['all_day'] === 1,
        'priority' => $row['priority'],
        'assigneeId' => $row['assignee_id'],
        'status' => $row['status'],
        'estimatedTime' => (int) $row['estimated_time'],
        'notes' => $row['notes'],
        'completedAt' => iso_from_mysql($row['completed_at']),
        'onTime' => $row['on_time'] === null ? null : (int) $row['on_time'] === 1,
        'recurrence' => $row['recurrence'],
        'helpedMemberId' => $row['helped_member_id'],
        'createdAt' => iso_from_mysql($row['created_at']),
    ];
}

function checkin_json(array $row): array
{
    $date = $row['date'];
    if ($date instanceof DateTimeInterface) {
        $date = $date->format('Y-m-d');
    }
    return [
        'id' => $row['id'],
        'date' => (string) $date,
        'wokeUpAt' => substr((string) $row['woke_up_at'], 0, 5),
        'gymDone' => (int) $row['gym_done'] === 1,
        'arrivedOnTime' => (int) $row['arrived_on_time'] === 1,
        'mood' => (int) $row['mood'],
    ];
}

function reward_json(array $row): array
{
    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'points' => (int) $row['points'],
        'claimed' => (int) $row['claimed'] === 1,
    ];
}

function can_see_assignment(array $user, string $assigneeId, string $tag): bool
{
    if ($user['account_role'] === 'owner') {
        return true;
    }
    if ($assigneeId === $user['id']) {
        return true;
    }
    return in_array($tag, user_tags($user), true);
}

function can_see_row(array $user, array $row): bool
{
    return can_see_assignment($user, (string) $row['assignee_id'], (string) $row['tag']);
}

function list_tasks(array $user): array
{
    if ($user['account_role'] === 'owner') {
        $rows = q('SELECT * FROM tasks')->fetchAll();
    } else {
        $tags = user_tags($user);
        $params = [$user['id']];
        $sql = 'SELECT * FROM tasks WHERE assignee_id = ?';
        if ($tags !== []) {
            $marks = implode(',', array_fill(0, count($tags), '?'));
            $sql .= " OR tag IN ($marks)";
            array_push($params, ...$tags);
        }
        $rows = q($sql, $params)->fetchAll();
    }
    return array_map('task_json', $rows);
}

function list_members(array $viewer): array
{
    $rows = q("SELECT * FROM users ORDER BY account_role = 'owner' DESC, created_at ASC, name ASC")->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        $includeEmail = $viewer['account_role'] === 'owner' || $row['id'] === $viewer['id'];
        $out[] = member_json($row, $includeEmail);
    }
    return $out;
}

function list_checkins(): array
{
    $rows = q('SELECT * FROM check_ins ORDER BY date ASC')->fetchAll();
    return array_map('checkin_json', $rows);
}

function list_rewards(): array
{
    $rows = q('SELECT * FROM rewards ORDER BY points ASC, title ASC')->fetchAll();
    return array_map('reward_json', $rows);
}

function state_payload(array $user): array
{
    $fresh = find_user($user['id']) ?? $user;
    return [
        'user' => session_json($fresh),
        'csrfToken' => csrf_token(),
        'pendingSample' => setting('pending_sample') === '1',
        'tasks' => list_tasks($fresh),
        'members' => list_members($fresh),
        'checkIns' => list_checkins(),
        'rewards' => list_rewards(),
    ];
}

function normalize_task(array $input, ?string $forcedId): array
{
    $taskId = $forcedId ?? trim((string) ($input['id'] ?? ''));
    if (!valid_id($taskId)) {
        throw new HttpException(400, 'Task id is invalid.');
    }
    $title = trim((string) ($input['title'] ?? ''));
    $title = preg_replace('/\s+/', ' ', $title) ?? $title;
    if ($title === '' || text_length($title) > 200) {
        throw new HttpException(400, 'Give the task a title (200 characters or fewer).');
    }
    $tag = (string) ($input['tag'] ?? '');
    if (!in_array($tag, TAGS, true)) {
        throw new HttpException(400, 'Unknown business tag.');
    }
    $priority = (string) ($input['priority'] ?? '');
    if (!in_array($priority, PRIORITIES, true)) {
        throw new HttpException(400, 'Unknown priority.');
    }
    $status = (string) ($input['status'] ?? '');
    if (!in_array($status, STATUSES, true)) {
        throw new HttpException(400, 'Unknown status.');
    }
    $assignee = (string) ($input['assigneeId'] ?? '');
    if (!valid_id($assignee)) {
        throw new HttpException(400, 'Choose an assignee.');
    }
    $rawEstimate = $input['estimatedTime'] ?? 15;
    if (!is_numeric($rawEstimate)) {
        $rawEstimate = 15;
    }
    $estimate = (int) round((float) $rawEstimate);
    if ($estimate < 15) {
        $estimate = 15;
    }
    if ($estimate > 20000) {
        $estimate = 20000;
    }
    $notes = (string) ($input['notes'] ?? '');
    if (text_length($notes) > 5000) {
        throw new HttpException(400, 'Notes are too long.');
    }
    $deadline = parse_optional_iso($input['deadline'] ?? null);
    $recurrence = $input['recurrence'] ?? null;
    if ($recurrence === '' || $recurrence === false) {
        $recurrence = null;
    }
    if ($recurrence !== null && $recurrence !== 'daily') {
        throw new HttpException(400, 'Unknown recurrence.');
    }
    $helped = $input['helpedMemberId'] ?? null;
    if ($helped === '' || $helped === false) {
        $helped = null;
    }
    if ($helped !== null) {
        if (!is_string($helped) || !valid_id($helped)) {
            throw new HttpException(400, 'Helped teammate is invalid.');
        }
    }
    $created = parse_optional_iso($input['createdAt'] ?? null) ?? mysql_now();
    $completed = null;
    $onTime = null;
    if ($status === 'Done') {
        $completed = parse_optional_iso($input['completedAt'] ?? null) ?? mysql_now();
        $onTime = $deadline === null || $completed <= $deadline ? 1 : 0;
    }
    return [
        'id' => $taskId,
        'title' => $title,
        'tag' => $tag,
        'deadline' => $deadline,
        'allDay' => bool_value($input['allDay'] ?? false) ? 1 : 0,
        'priority' => $priority,
        'assigneeId' => $assignee,
        'status' => $status,
        'estimatedTime' => $estimate,
        'notes' => $notes,
        'completedAt' => $completed,
        'onTime' => $onTime,
        'recurrence' => $recurrence,
        'helpedMemberId' => $helped,
        'createdAt' => $created,
    ];
}

function assert_people_exist(array $task): void
{
    if (!find_user($task['assigneeId'])) {
        throw new HttpException(400, 'Assignee does not exist.');
    }
    if ($task['helpedMemberId'] !== null && !find_user($task['helpedMemberId'])) {
        throw new HttpException(400, 'Helped teammate does not exist.');
    }
}

function translate_pdo(PDOException $e): never
{
    $code = (int) ($e->errorInfo[1] ?? 0);
    if ($code === 1062) {
        throw new HttpException(409, 'That record already exists.');
    }
    if ($code === 1452) {
        throw new HttpException(400, 'Assignee or helped teammate does not exist.');
    }
    error_log('[lodhi-hq] query failed: ' . $e->getMessage());
    throw new HttpException(500, 'Something went wrong.');
}

function insert_task(array $task): void
{
    try {
        q(
            'INSERT INTO tasks (id, title, tag, deadline, all_day, priority, assignee_id, status, estimated_time, notes, completed_at, on_time, recurrence, helped_member_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $task['id'],
                $task['title'],
                $task['tag'],
                $task['deadline'],
                $task['allDay'],
                $task['priority'],
                $task['assigneeId'],
                $task['status'],
                $task['estimatedTime'],
                $task['notes'],
                $task['completedAt'],
                $task['onTime'],
                $task['recurrence'],
                $task['helpedMemberId'],
                $task['createdAt'],
            ]
        );
    } catch (PDOException $e) {
        translate_pdo($e);
    }
}

function update_task(array $task): void
{
    try {
        q(
            'UPDATE tasks SET title = ?, tag = ?, deadline = ?, all_day = ?, priority = ?, assignee_id = ?, status = ?, estimated_time = ?, notes = ?, completed_at = ?, on_time = ?, recurrence = ?, helped_member_id = ?, created_at = ? WHERE id = ?',
            [
                $task['title'],
                $task['tag'],
                $task['deadline'],
                $task['allDay'],
                $task['priority'],
                $task['assigneeId'],
                $task['status'],
                $task['estimatedTime'],
                $task['notes'],
                $task['completedAt'],
                $task['onTime'],
                $task['recurrence'],
                $task['helpedMemberId'],
                $task['createdAt'],
                $task['id'],
            ]
        );
    } catch (PDOException $e) {
        translate_pdo($e);
    }
}

function task_by_id(string $id): ?array
{
    $row = q('SELECT * FROM tasks WHERE id = ?', [$id])->fetch();
    return $row ?: null;
}

function write_checkin(array $input): array
{
    $date = (string) ($input['date'] ?? '');
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        throw new HttpException(400, 'Check-in date is invalid.');
    }
    $woke = (string) ($input['wokeUpAt'] ?? '');
    if (preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $woke) !== 1) {
        throw new HttpException(400, 'Wake-up time is invalid.');
    }
    $mood = int_value($input['mood'] ?? null);
    if ($mood === false || $mood < 1 || $mood > 5) {
        throw new HttpException(400, 'Mood must be from 1 to 5.');
    }
    $gym = bool_value($input['gymDone'] ?? false) ? 1 : 0;
    $arrived = bool_value($input['arrivedOnTime'] ?? false) ? 1 : 0;
    $id = 'check_' . $date;
    $existing = q('SELECT id FROM check_ins WHERE date = ?', [$date])->fetch();
    if ($existing) {
        q(
            'UPDATE check_ins SET woke_up_at = ?, gym_done = ?, arrived_on_time = ?, mood = ? WHERE date = ?',
            [$woke, $gym, $arrived, $mood, $date]
        );
    } else {
        q(
            'INSERT INTO check_ins (id, date, woke_up_at, gym_done, arrived_on_time, mood) VALUES (?, ?, ?, ?, ?, ?)',
            [$id, $date, $woke, $gym, $arrived, $mood]
        );
    }
    $row = q('SELECT * FROM check_ins WHERE date = ?', [$date])->fetch();
    return checkin_json($row);
}

function normalize_reward(array $input, ?string $forcedId): array
{
    $rewardId = $forcedId ?? trim((string) ($input['id'] ?? ''));
    if ($rewardId === '') {
        $rewardId = 'reward_' . bin2hex(random_bytes(4));
    }
    if (!valid_id($rewardId)) {
        throw new HttpException(400, 'Reward id is invalid.');
    }
    $title = trim((string) ($input['title'] ?? ''));
    $title = preg_replace('/\s+/', ' ', $title) ?? $title;
    if ($title === '' || text_length($title) > 160) {
        throw new HttpException(400, 'Reward title is required (160 characters or fewer).');
    }
    $points = int_value($input['points'] ?? null);
    if ($points === false || $points < 0 || $points > 1000000) {
        throw new HttpException(400, 'Points must be a whole number from 0 to 1000000.');
    }
    return [
        'id' => $rewardId,
        'title' => $title,
        'points' => $points,
        'claimed' => bool_value($input['claimed'] ?? false) ? 1 : 0,
    ];
}

function insert_reward(array $reward): void
{
    try {
        q(
            'INSERT INTO rewards (id, title, points, claimed) VALUES (?, ?, ?, ?)',
            [$reward['id'], $reward['title'], $reward['points'], $reward['claimed']]
        );
    } catch (PDOException $e) {
        translate_pdo($e);
    }
}

function normalize_member_fields(array $input, ?string $forcedId, bool $isNew): array
{
    $memberId = $forcedId ?? trim((string) ($input['id'] ?? ''));
    if ($isNew && $memberId === '') {
        $memberId = 'member_' . bin2hex(random_bytes(4));
    }
    if (!valid_id($memberId)) {
        throw new HttpException(400, 'Account id is invalid.');
    }
    if ($isNew && $memberId === OWNER_ID) {
        throw new HttpException(400, 'That account id is reserved.');
    }
    $name = trim((string) ($input['name'] ?? ''));
    $role = trim((string) ($input['role'] ?? ''));
    $contact = trim((string) ($input['contact'] ?? ''));
    if ($name === '' || text_length($name) > 120) {
        throw new HttpException(400, 'Name is required (120 characters or fewer).');
    }
    if ($role === '' || text_length($role) > 120) {
        throw new HttpException(400, 'Role is required (120 characters or fewer).');
    }
    if (text_length($contact) > 255) {
        throw new HttpException(400, 'Contact is too long.');
    }
    $email = strtolower(trim((string) ($input['email'] ?? '')));
    if (!valid_email($email)) {
        throw new HttpException(400, 'Enter a valid email.');
    }
    $password = $input['password'] ?? null;
    if ($password === '') {
        $password = null;
    }
    if ($password !== null) {
        if (!is_string($password) || strlen($password) < 8 || strlen($password) > 200) {
            throw new HttpException(400, 'Password must be 8 to 200 characters.');
        }
    }
    if ($isNew && $password === null) {
        throw new HttpException(400, 'Set a temporary password for the new account.');
    }
    $taken = find_user_by_email($email);
    if ($taken && $taken['id'] !== $memberId) {
        throw new HttpException(409, 'That email is already used by another account.');
    }
    return [
        'id' => $memberId,
        'name' => $name,
        'role' => $role,
        'contact' => $contact,
        'email' => $email,
        'tags' => normalize_tags($input['businessTags'] ?? []),
        'password' => $password,
    ];
}

function insert_staff(array $fields, string $passwordHash, int $mustChange): void
{
    $now = mysql_now();
    try {
        q(
            'INSERT INTO users (id, email, password_hash, name, job_title, account_role, business_tags, contact, active, must_change_password, session_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)',
            [
                $fields['id'],
                $fields['email'],
                $passwordHash,
                $fields['name'],
                $fields['role'],
                'staff',
                json_encode($fields['tags'], JSON_UNESCAPED_UNICODE),
                $fields['contact'],
                $mustChange,
                $now,
                $now,
            ]
        );
    } catch (PDOException $e) {
        translate_pdo($e);
    }
}

function completions_between(DateTimeImmutable $from, DateTimeImmutable $to): array
{
    $span = $to->getTimestamp() - $from->getTimestamp();
    if ($span <= 0) {
        throw new HttpException(400, 'End must be after start.');
    }
    if ($span > 400 * 86400) {
        throw new HttpException(400, 'That date range is too long.');
    }
    $rows = q(
        'SELECT assignee_id, COUNT(*) AS completed,
                SUM(CASE WHEN on_time IS NULL OR on_time = 1 THEN 1 ELSE 0 END) AS hits
         FROM tasks
         WHERE status = ? AND completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?
         GROUP BY assignee_id',
        ['Done', $from->format('Y-m-d H:i:s.v'), $to->format('Y-m-d H:i:s.v')]
    )->fetchAll();
    $map = [];
    foreach ($rows as $row) {
        $map[$row['assignee_id']] = [(int) $row['completed'], (int) $row['hits']];
    }
    $members = q('SELECT id FROM users')->fetchAll();
    $out = [];
    foreach ($members as $member) {
        [$completed, $hits] = $map[$member['id']] ?? [0, 0];
        $out[] = [
            'memberId' => $member['id'],
            'completed' => $completed,
            'onTimeRate' => $completed === 0 ? null : (int) round(($hits / $completed) * 100),
        ];
    }
    usort($out, function (array $a, array $b): int {
        if ($a['completed'] !== $b['completed']) {
            return $b['completed'] <=> $a['completed'];
        }
        return ($b['onTimeRate'] ?? -1) <=> ($a['onTimeRate'] ?? -1);
    });
    return $out;
}

function reset_board(array $user, array $input): array
{
    require_owner($user);
    $members = $input['members'] ?? null;
    $tasks = $input['tasks'] ?? null;
    $checkIns = $input['checkIns'] ?? null;
    $rewards = $input['rewards'] ?? null;
    if (!is_array($members) || !is_array($tasks) || !is_array($checkIns) || !is_array($rewards)) {
        throw new HttpException(400, 'Sample data is incomplete.');
    }
    if (count($tasks) > 2000 || count($members) > 200 || count($checkIns) > 2000 || count($rewards) > 200) {
        throw new HttpException(400, 'That import is too large.');
    }

    $pdo = db();
    $locked = (int) $pdo->query("SELECT GET_LOCK('lodhi_hq_reset', 30)")->fetchColumn();
    if ($locked !== 1) {
        throw new HttpException(503, 'The board is busy. Try again.');
    }
    try {
        $pdo->beginTransaction();
        q('DELETE FROM tasks');
        q('DELETE FROM check_ins');
        q('DELETE FROM rewards');
        q("DELETE FROM users WHERE account_role = 'staff'");

        $ownerMember = null;
        $seen = [];
        foreach ($members as $member) {
            if (!is_array($member)) {
                throw new HttpException(400, 'A team member is invalid.');
            }
            $isOwner = bool_value($member['owner'] ?? false) || ($member['id'] ?? '') === OWNER_ID;
            if ($isOwner) {
                $ownerMember = $member;
                continue;
            }
            $id = (string) ($member['id'] ?? '');
            if (!valid_id($id) || isset($seen[$id])) {
                throw new HttpException(400, 'Sample member id is invalid.');
            }
            $seen[$id] = true;
            $email = strtolower(trim((string) ($member['email'] ?? '')));
            if ($email === '') {
                $email = $id . '@lodhi.local';
            }
            $fields = normalize_member_fields([
                'id' => $id,
                'name' => $member['name'] ?? '',
                'role' => $member['role'] ?? 'Staff',
                'contact' => $member['contact'] ?? '',
                'email' => $email,
                'businessTags' => $member['businessTags'] ?? [],
                'password' => DEMO_STAFF_PASSWORD,
            ], $id, true);
            insert_staff($fields, password_hash(DEMO_STAFF_PASSWORD, PASSWORD_DEFAULT), 1);
        }
        if (is_array($ownerMember)) {
            $name = trim((string) ($ownerMember['name'] ?? ''));
            $role = trim((string) ($ownerMember['role'] ?? 'Owner'));
            $contact = trim((string) ($ownerMember['contact'] ?? ''));
            if ($name === '' || text_length($name) > 120) {
                throw new HttpException(400, 'Owner name in the sample is invalid.');
            }
            if ($role === '' || text_length($role) > 120) {
                $role = 'Owner';
            }
            if (text_length($contact) > 255) {
                throw new HttpException(400, 'Owner contact in the sample is too long.');
            }
            q(
                'UPDATE users SET name = ?, job_title = ?, business_tags = ?, contact = ?, updated_at = ? WHERE id = ? AND account_role = ?',
                [
                    $name,
                    $role,
                    json_encode(normalize_tags($ownerMember['businessTags'] ?? []), JSON_UNESCAPED_UNICODE),
                    $contact,
                    mysql_now(),
                    OWNER_ID,
                    'owner',
                ]
            );
        }
        foreach ($tasks as $task) {
            if (!is_array($task)) {
                throw new HttpException(400, 'A task is invalid.');
            }
            $normalized = normalize_task($task, null);
            assert_people_exist($normalized);
            insert_task($normalized);
        }
        foreach ($checkIns as $checkIn) {
            if (!is_array($checkIn)) {
                throw new HttpException(400, 'A check-in is invalid.');
            }
            write_checkin($checkIn);
        }
        foreach ($rewards as $reward) {
            if (!is_array($reward)) {
                throw new HttpException(400, 'A reward is invalid.');
            }
            insert_reward(normalize_reward($reward, isset($reward['id']) ? (string) $reward['id'] : null));
        }
        set_setting('pending_sample', '0');
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('lodhi_hq_reset')");
    }
    $fresh = find_user($user['id']);
    if (!$fresh) {
        throw new HttpException(500, 'Something went wrong.');
    }
    return state_payload($fresh);
}
