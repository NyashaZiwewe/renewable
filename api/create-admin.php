<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/lib.php';
load_env();
$email = strtolower(trim($argv[1] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fwrite(STDERR, "Usage: php api/create-admin.php admin@example.com\n"); exit(2); }
$pdo = db();
if ($pdo) {
    $dbHost = envv('DB_HOST', envv('MYSQL_HOST', 'localhost'));
    $dbName = envv('DB_NAME', envv('MYSQL_DATABASE', ''));
    fwrite(STDOUT, "Using MySQL database {$dbName} on {$dbHost}.\n");
} else {
    fwrite(STDOUT, "Using JSON files in " . API_DATA . ". No MySQL connection settings were found.\n");
}
$password = read_secret('New admin password: ');
$confirmation = read_secret('Confirm password: ');
if ($password !== $confirmation) { fwrite(STDERR, "Passwords do not match.\n"); exit(2); }
if ($error = password_error($password)) { fwrite(STDERR, $error . "\n"); exit(2); }
$accountLock = lock_admin_accounts();
$users = read_store('users');
$found = false;
foreach ($users as &$user) {
    if (($user['email'] ?? '') === $email && ($user['role'] ?? 'admin') === 'admin') {
        update_admin_password($users, $user, $password);
        $found = true;
        break;
    }
}
unset($user);
if (!$found) {
    $account = new_admin_account($email, $password);
    if ($pdo) {
        db_insert($pdo, 'users', $account);
    } else {
        $users[] = $account;
        write_store('users', $users);
    }
}
unlock_admin_accounts($accountLock);
fwrite(STDOUT, $found ? "Admin password updated.\n" : "Admin account created.\n");

function read_secret(string $prompt): string {
    $terminalState = '';
    if (PHP_OS_FAMILY !== 'Windows' && function_exists('shell_exec')) {
        $terminalState = trim((string)@shell_exec('stty -g 2>/dev/null'));
        if ($terminalState !== '') @shell_exec('stty -echo 2>/dev/null');
    }
    fwrite(STDOUT, $prompt);
    try {
        return rtrim((string)fgets(STDIN), "\r\n");
    } finally {
        if ($terminalState !== '') {
            @shell_exec('stty ' . escapeshellarg($terminalState) . ' 2>/dev/null');
            fwrite(STDOUT, PHP_EOL);
        }
    }
}
