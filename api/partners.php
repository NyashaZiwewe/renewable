<?php
declare(strict_types=1);

function partner_content(): array {
    $pdo = db();
    $raw = $pdo ? $pdo->query('SELECT payload FROM partner_content WHERE id=1')->fetchColumn() : @file_get_contents(API_DATA . '/partners.json');
    return json_decode((string)$raw, true) ?: ['partners' => []];
}

function save_partner_content(): never {
    $body = body_json();
    $partners = $body['partners'] ?? null;
    if (!is_array($partners) || !array_is_list($partners) || count($partners) > 100) {
        json_response(400, ['message' => 'Enter an ordered list of up to 100 partners.']);
    }
    $rows = []; $ids = [];
    foreach ($partners as $partner) {
        if (!is_array($partner)) json_response(400, ['message' => 'Enter valid partner details.']);
        $row = [];
        foreach (['id' => 80, 'name' => 160, 'logoUrl' => 1000, 'websiteUrl' => 1000] as $key => $limit) {
            $value = $partner[$key] ?? null;
            if (!is_string($value) || trim($value) === '' || preg_match_all('/./us', $value) > $limit) {
                json_response(400, ['message' => 'Enter a valid partner ' . $key . '.']);
            }
            $row[$key] = trim($value);
        }
        if (!preg_match('/^[a-zA-Z0-9_-]{1,80}$/', $row['id']) || isset($ids[$row['id']])) json_response(400, ['message' => 'Partner IDs must be valid and unique.']);
        if (!safe_image($row['logoUrl'])) json_response(400, ['message' => 'Logo must be an http(s) URL or local /img path.']);
        if (!filter_var($row['websiteUrl'], FILTER_VALIDATE_URL) || !in_array(strtolower(parse_url($row['websiteUrl'], PHP_URL_SCHEME) ?? ''), ['http', 'https'], true)) {
            json_response(400, ['message' => 'Enter a full http or https partner website URL.']);
        }
        $ids[$row['id']] = true;
        $rows[] = $row;
    }
    $content = ['partners' => $rows];
    $json = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $pdo = db();
    if ($pdo) {
        $stmt = $pdo->prepare('INSERT INTO partner_content(id,payload) VALUES(1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)');
        $stmt->execute([$json]);
    } elseif (file_put_contents(API_DATA . '/partners.json', $json, LOCK_EX) === false) {
        throw new RuntimeException('Unable to save partners.');
    }
    json_response(200, $content);
}
