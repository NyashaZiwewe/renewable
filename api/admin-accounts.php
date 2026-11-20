<?php
declare(strict_types=1);

function lock_admin_accounts() {
    $pdo = db();
    if ($pdo) {
        $locked = $pdo->query("SELECT GET_LOCK(CONCAT('renewable_auth_', SHA1(DATABASE())), 10)")->fetchColumn();
        if ((int)$locked !== 1) throw new RuntimeException('Unable to lock admin accounts.');
        return $pdo;
    }
    if (!is_dir(API_DATA) && !mkdir(API_DATA, 0700, true) && !is_dir(API_DATA)) {
        throw new RuntimeException('Data directory is unavailable.');
    }
    $lock = fopen(API_DATA . '/admin-accounts.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock admin accounts.');
    return $lock;
}

function unlock_admin_accounts($lock): void {
    if ($lock instanceof PDO) {
        $lock->query("SELECT RELEASE_LOCK(CONCAT('renewable_auth_', SHA1(DATABASE())))");
    } else {
        fclose($lock);
    }
}

function create_admin_account(): never {
    $body = body_json();
    $email = email_norm(is_string($body['email'] ?? null) ? $body['email'] : '');
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(400, ['field' => 'email', 'message' => 'Enter a valid email address.']);
    }
    if ($error = password_error($password)) {
        json_response(400, ['field' => 'password', 'message' => $error]);
    }
    $account = new_admin_account($email, $password);
    $users = read_store('users');
    foreach ($users as $user) {
        if (email_norm($user['email']) === $email) {
            json_response(409, ['field' => 'email', 'message' => 'An account already uses this email address.']);
        }
    }
    $pdo = db();
    if ($pdo) {
        db_insert($pdo, 'users', $account);
    } else {
        $users[] = $account;
        write_store('users', $users);
    }
    json_response(201, ['user' => ['id' => $account['id'], 'email' => $email], 'message' => 'Admin account created.']);
}

function new_admin_account(string $email, string $password): array {
    $now = now_iso();
    return [
        'id' => uuid(), 'email' => $email, 'role' => 'admin',
        'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
        'createdAt' => $now, 'passwordChangedAt' => $now,
    ];
}

function request_reset(): never {
    $body = body_json();
    $email = email_norm(is_string($body['email'] ?? null) ? $body['email'] : '');
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(400, ['field' => 'email', 'message' => 'Enter a valid email address.']);
    }
    if (!rate_allowed('reset:' . request_ip() . ':' . $email, 5, 3600)) {
        json_response(429, ['message' => 'Too many reset requests. Try again later.']);
    }

    $base = rtrim(envv('BASE_URL'), '/');
    $parts = parse_url($base);
    if (!filter_var($base, FILTER_VALIDATE_URL) || !in_array($parts['scheme'] ?? '', ['https', 'http'], true)
        || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user'])
        || !envv('RESEND_API_KEY') || !envv('RESET_EMAIL_FROM', envv('LEAD_EMAIL_FROM'))
        || !function_exists('curl_init')) {
        json_response(503, ['message' => 'Password reset email is unavailable. Contact your site administrator.']);
    }

    $lock = lock_admin_accounts();
    $recipient = null;
    $token = null;
    try {
        foreach (read_store('users') as $user) {
            if ($user['email'] !== $email || ($user['role'] ?? 'admin') !== 'admin') continue;
            $recipient = $user['email'];
            $token = token();
            $resets = array_values(array_filter(read_store('resets'), fn($reset) =>
                empty($reset['usedAt']) && strtotime($reset['expiresAt']) > time()
            ));
            $resets[] = [
                'id' => uuid(), 'userId' => $user['id'], 'tokenHash' => token_hash($token),
                'createdAt' => now_iso(), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + RESET_LIFETIME),
                'usedAt' => null,
            ];
            write_store('resets', $resets);
            break;
        }
    } finally {
        unlock_admin_accounts($lock);
    }
    if ($recipient !== null) {
        $url = $base . '/admin/reset-password.html?token=' . rawurlencode($token);
        send_email($recipient, 'Reset your admin password', "Use this link to reset your admin password. It expires in 30 minutes:\n\n{$url}\n", 'RESET_EMAIL_FROM');
    }
    json_response(200, ['ok' => true, 'message' => 'If an account exists for that address, you will receive a reset link.']);
}

function reset_password(): never {
    $body = body_json();
    $password = is_string($body['newPassword'] ?? null) ? $body['newPassword'] : '';
    if ($error = password_error($password)) json_response(400, ['error' => 'weak_password', 'message' => $error]);
    $hash = token_hash(is_string($body['token'] ?? null) ? $body['token'] : '');
    $resets = read_store('resets');
    foreach ($resets as $reset) {
        if (!empty($reset['usedAt']) || strtotime($reset['expiresAt']) <= time() || !hash_equals($reset['tokenHash'], $hash)) continue;
        $users = read_store('users');
        foreach ($users as &$user) {
            if ($user['id'] !== $reset['userId'] || ($user['role'] ?? 'admin') !== 'admin') continue;
            update_admin_password($users, $user, $password);
            json_response(200, ['ok' => true, 'message' => 'Password has been reset. Sign in with the new password.']);
        }
        break;
    }
    json_response(400, ['error' => 'invalid_reset', 'message' => 'Reset link is invalid or expired.']);
}

function change_password(array $auth): never {
    $body = body_json();
    $password = is_string($body['newPassword'] ?? null) ? $body['newPassword'] : '';
    if ($error = password_error($password)) json_response(400, ['error' => 'weak_password', 'message' => $error]);
    $current = is_string($body['currentPassword'] ?? null) ? $body['currentPassword'] : '';
    if (!verify_password($current, $auth['user']['passwordHash'])) {
        json_response(400, ['error' => 'invalid_password', 'message' => 'Current password is incorrect.']);
    }

    $users = read_store('users');
    foreach ($users as &$user) {
        if ($user['id'] !== $auth['user']['id']) continue;
        update_admin_password($users, $user, $password, $auth['session']['id']);
        json_response(200, ['ok' => true, 'message' => 'Password changed.']);
    }
    json_response(401, ['error' => 'not_authenticated', 'message' => 'Session expired. Sign in again.']);
}

function update_admin_password(array &$users, array &$user, string $password, ?string $keepSession = null): void {
    $id = $user['id'];
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $now = now_iso();
    $pdo = db();
    if ($pdo) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM password_resets WHERE user_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM admin_sessions WHERE user_id=? AND id<>?')->execute([$id, $keepSession ?? '']);
            $pdo->prepare('UPDATE admin_users SET password_hash=?, password_changed_at=? WHERE id=?')
                ->execute([$hash, sql_date($now), $id]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        return;
    }
    write_store('resets', array_values(array_filter(read_store('resets'), fn($reset) => $reset['userId'] !== $id)));
    write_store('sessions', array_values(array_filter(read_store('sessions'), fn($session) =>
        $session['userId'] !== $id || $session['id'] === $keepSession
    )));
    $user['passwordHash'] = $hash;
    $user['passwordChangedAt'] = $now;
    write_store('users', $users);
}
