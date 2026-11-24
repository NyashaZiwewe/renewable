<?php
declare(strict_types=1);

function team_locale(): string {
    $locale = $_GET['locale'] ?? 'en';
    if (!is_string($locale) || !in_array($locale, ['en', 'pt'], true)) {
        json_response(400, ['message' => 'Choose English or Portuguese.']);
    }
    return $locale;
}

function team_content(string $locale): array {
    $pdo = db();
    if ($pdo) {
        $stmt = $pdo->prepare('SELECT payload FROM team_content WHERE locale=?');
        $stmt->execute([$locale]);
        $raw = $stmt->fetchColumn();
    } else {
        $raw = @file_get_contents(API_DATA . '/team-' . $locale . '.json');
    }
    return json_decode((string)$raw, true) ?: ['intro' => '', 'members' => []];
}

function team_editor_content(string $locale, array $content): array {
    if (trim($content['intro']) === '') {
        $translations = json_decode((string)@file_get_contents(API_ROOT . '/locales/' . $locale . '/common.json'), true);
        $content['intro'] = $translations['pages']['team']['cultureIntro'] ?? '';
    }
    return $content;
}

function validate_team_content(array $body): array {
    if (!is_string($body['intro'] ?? null) || preg_match_all('/./us', $body['intro']) > 5000 ||
        !isset($body['members']) || !is_array($body['members']) ||
        !array_is_list($body['members']) || count($body['members']) > 100) {
        throw new InvalidArgumentException('Enter an introduction of up to 5000 characters and at most 100 team members.');
    }
    $members = []; $ids = [];
    foreach ($body['members'] as $member) {
        if (!is_array($member)) throw new InvalidArgumentException('Enter valid team profiles.');
        $row = [];
        foreach (['id' => 80, 'name' => 160, 'title' => 160, 'summary' => 5000, 'imageUrl' => 2048, 'status' => 20] as $key => $limit) {
            $value = $member[$key] ?? ($key === 'imageUrl' ? '' : null);
            if (!is_string($value) || preg_match_all('/./us', $value) > $limit) throw new InvalidArgumentException('Invalid or overly long team profile field: ' . $key . '.');
            $row[$key] = trim($value);
        }
        if (!preg_match('/^[a-zA-Z0-9_-]{1,80}$/', $row['id']) || isset($ids[$row['id']])) throw new InvalidArgumentException('Each team member needs a unique valid ID.');
        if (!$row['name'] || !$row['title'] || !$row['summary']) throw new InvalidArgumentException('Every team member needs a name, title and professional summary.');
        if (!in_array($row['status'], ['draft', 'published'], true)) throw new InvalidArgumentException('Choose draft or published for each member.');
        if ($row['imageUrl'] && !safe_image($row['imageUrl'])) throw new InvalidArgumentException('Portrait must be an http(s) URL or a local /img path.');
        $ids[$row['id']] = true;
        $members[] = $row;
    }
    return ['intro' => trim($body['intro']), 'members' => $members];
}

function save_team_content(string $locale): never {
    try {
        $content = validate_team_content(body_json());
    } catch (InvalidArgumentException $error) {
        json_response(400, ['message' => $error->getMessage()]);
    }
    $payload = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $pdo = db();
    if ($pdo) {
        $stmt = $pdo->prepare('INSERT INTO team_content(locale,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)');
        $stmt->execute([$locale, $payload]);
    } elseif (file_put_contents(API_DATA . '/team-' . $locale . '.json', $payload, LOCK_EX) === false) {
        throw new RuntimeException('Unable to save team content.');
    }
    json_response(200, team_editor_content($locale, $content));
}
