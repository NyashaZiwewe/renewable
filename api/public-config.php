<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';
load_env();
$baseUrl = rtrim(envv('BASE_URL'), '/');

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');
echo 'window.APP_PUBLIC_CONFIG = Object.freeze({BASE_URL: ' . json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '});';
