<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';

try {
    start_session();
} catch (ConfigException $e) {
    render_page('Database config', '<p>' . h($e->getMessage()) . '</p>');
    exit;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$error = '';
$name = 'Muhammad Hassan Lodhi';
$email = '';
$contact = '';
$import = true;

try {
    $blocked = install_block_reason();
} catch (ConfigException $e) {
    render_page('Database config', '<p>' . h($e->getMessage()) . '</p>');
    exit;
}

if ($blocked !== null) {
    http_response_code(403);
    render_page(
        'Already installed',
        '<p>' . h($blocked) . ' This page will not run again.</p><p><a href="/">Go to sign in</a></p>'
    );
    exit;
}

if ($method === 'POST') {
    $name = trim((string) ($_POST['name'] ?? ''));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $contact = trim((string) ($_POST['contact'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['password_confirm'] ?? '');
    $import = isset($_POST['import_sample']);
    $token = (string) ($_POST['csrf'] ?? '');

    if (!csrf_matches($token)) {
        $error = 'The form expired. Reload the page and try again.';
    } elseif ($name === '' || text_length($name) > 120) {
        $error = 'Enter the owner name (120 characters or fewer).';
    } elseif (!valid_email($email)) {
        $error = 'Enter a valid email.';
    } elseif (text_length($contact) > 255) {
        $error = 'Contact is too long.';
    } elseif (strlen($password) < 8 || strlen($password) > 200) {
        $error = 'Password must be 8 to 200 characters.';
    } elseif ($password !== $confirm) {
        $error = 'The passwords do not match.';
    } else {
        try {
            install_owner($name, $email, $contact, $password, $import);
        } catch (ConfigException $e) {
            render_page('Database config', '<p>' . h($e->getMessage()) . '</p>');
            exit;
        } catch (Throwable $e) {
            error_log('[lodhi-hq] setup failed: ' . $e->getMessage());
            $again = install_block_reason();
            if ($again !== null) {
                http_response_code(403);
                render_page('Already installed', '<p>' . h($again) . '</p><p><a href="/">Go to sign in</a></p>');
                exit;
            }
            $error = 'Setup could not finish. Check that api/config.php points at an empty MySQL database, then try again.';
        }
        if ($error === '') {
            $sample = $import
                ? '<p>The demo board loads the first time you sign in. Sample staff use emails such as <code>store-staff@lodhi.local</code> and the temporary password <code>' . h(DEMO_STAFF_PASSWORD) . '</code>. They will be asked to change it.</p>'
                : '';
            render_page(
                'Lodhi HQ is ready',
                '<p>The owner account is created. This installer will not run again.</p>'
                . $sample
                . '<p><a href="/">Sign in</a></p>'
            );
            exit;
        }
    }
}

$token = csrf_token();
$body = '<form method="post" action="/api/setup.php" autocomplete="off">
  <input type="hidden" name="csrf" value="' . h($token) . '">
  <label>Owner name<input name="name" required maxlength="120" value="' . h($name) . '"></label>
  <label>Email<input name="email" type="email" required maxlength="255" autocomplete="username" value="' . h($email) . '"></label>
  <label>Contact <span class="hint">(optional)</span><input name="contact" maxlength="255" value="' . h($contact) . '" placeholder="Phone"></label>
  <label>Password<input name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
  <label>Confirm password<input name="password_confirm" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
  <label class="check"><input type="checkbox" name="import_sample" value="1"' . ($import ? ' checked' : '') . '> Load the demo board the first time you sign in</label>
  <p class="hint">Demo tasks, check-ins, rewards, and the sample team. Staff sign in with an @lodhi.local email and temporary password ' . h(DEMO_STAFF_PASSWORD) . '.</p>
  ' . ($error !== '' ? '<p class="error">' . h($error) . '</p>' : '') . '
  <button type="submit">Create owner account</button>
</form>';
render_page('Set up Lodhi HQ', $body);

function install_block_reason(): ?string
{
    if (is_file(__DIR__ . '/setup.lock')) {
        return 'Lodhi HQ is already set up.';
    }
    try {
        if (setting('installed') === '1') {
            return 'Lodhi HQ is already set up.';
        }
        $owner = q("SELECT id FROM users WHERE account_role = 'owner' LIMIT 1")->fetchColumn();
        if ($owner) {
            return 'An owner account already exists.';
        }
    } catch (ConfigException $e) {
        throw $e;
    } catch (Throwable) {
        return null;
    }
    return null;
}

function install_owner(string $name, string $email, string $contact, string $password, bool $import): void
{
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('schema.sql is missing.');
    }
    run_sql_script($sql);
    if (install_block_reason() !== null) {
        throw new RuntimeException('already installed');
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $now = mysql_now();
        q(
            'INSERT INTO users (id, email, password_hash, name, job_title, account_role, business_tags, contact, active, must_change_password, session_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)',
            [
                OWNER_ID,
                $email,
                password_hash($password, PASSWORD_DEFAULT),
                $name,
                'Owner',
                'owner',
                json_encode(TAGS, JSON_UNESCAPED_UNICODE),
                $contact,
                $now,
                $now,
            ]
        );
        set_setting('installed', '1');
        set_setting('pending_sample', $import ? '1' : '0');
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    $written = file_put_contents(__DIR__ . '/setup.lock', gmdate('c') . "\n", LOCK_EX);
    if ($written === false) {
        error_log('[lodhi-hq] could not write setup.lock; the database flag still blocks a second run');
    }
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function render_page(string $title, string $body): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>'
        . h($title)
        . ' · Lodhi HQ</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,650&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet"><style>
    :root { color-scheme: light; }
    body { margin: 0; min-height: 100vh; background: #f3efe7; color: #1c1917; font-family: Outfit, ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 28rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 560; font-size: 2.4rem; line-height: 1.1; margin: 0.4rem 0 0; }
    .brand { font-family: Fraunces, Georgia, serif; font-size: 1.7rem; }
    .brand span { color: #d97706; }
    p { line-height: 1.5; }
    a { color: #1c1917; }
    form { margin-top: 1.5rem; background: #fff; border: 1px solid #e6dfd2; border-radius: 1.25rem; padding: 1.25rem; box-shadow: 0 10px 28px rgba(28,25,23,0.05); }
    label { display: block; margin-bottom: 0.85rem; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #78716c; }
    input[type="text"], input[type="email"], input[type="password"], input:not([type]) { display: block; width: 100%; box-sizing: border-box; margin-top: 0.35rem; height: 2.6rem; border-radius: 0.75rem; border: 1px solid #e6dfd2; padding: 0 0.75rem; font: inherit; text-transform: none; letter-spacing: 0; color: #1c1917; font-weight: 400; }
    label.check { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 0.95rem; color: #1c1917; display: flex; gap: 0.5rem; align-items: flex-start; }
    label.check input { margin-top: 0.2rem; }
    .hint { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 0.85rem; color: #78716c; }
    .error { color: #b91c1c; font-size: 0.92rem; }
    button { height: 2.6rem; border: 0; border-radius: 0.75rem; background: #1c1917; color: #fff; font: inherit; font-weight: 600; padding: 0 1rem; cursor: pointer; }
    code { font-size: 0.92em; }
    </style></head><body><main><div class="brand">Lodhi <span>HQ</span></div><h1>'
        . h($title)
        . '</h1>'
        . $body
        . '</main></body></html>';
}
