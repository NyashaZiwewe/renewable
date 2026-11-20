<?php
declare(strict_types=1);

function faq_defaults(string $locale): array {
    $translations = json_decode(file_get_contents(API_ROOT . "/locales/$locale/common.json"), true, 512, JSON_THROW_ON_ERROR);
    $faqs = [];
    foreach ($translations['pages']['resources']['faqs'] as $index => $faq) {
        $faqs[] = ['id' => 'default-' . ($index + 1), 'question' => $faq['question'], 'answer' => $faq['answer']];
    }
    return $faqs;
}

function faq_decode(string|false $raw, string $locale): array {
    return $raw === false ? faq_defaults($locale) : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
}

function faq_read_file(string $path, string $locale): array {
    if (!is_file($path)) return faq_defaults($locale);
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException('Unable to read FAQs.');
    return faq_decode($raw, $locale);
}

function faq_list(string $locale): array {
    $pdo = db();
    if ($pdo) {
        $query = $pdo->prepare('SELECT payload FROM faq_content WHERE locale=?');
        $query->execute([$locale]);
        return faq_decode($query->fetchColumn(), $locale);
    }
    return faq_read_file(API_DATA . "/faqs-$locale.json", $locale);
}

function faq_update(string $locale, callable $update): ?array {
    $pdo = db();
    if ($pdo) {
        $pdo->beginTransaction();
        try {
            $seed = $pdo->prepare('INSERT INTO faq_content(locale,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE locale=locale');
            $seed->execute([$locale, json_encode(faq_defaults($locale), JSON_THROW_ON_ERROR)]);
            $query = $pdo->prepare('SELECT payload FROM faq_content WHERE locale=? FOR UPDATE');
            $query->execute([$locale]);
            $faqs = $update(faq_decode($query->fetchColumn(), $locale));
            if ($faqs !== null) {
                $save = $pdo->prepare('UPDATE faq_content SET payload=? WHERE locale=?');
                $save->execute([json_encode($faqs, JSON_THROW_ON_ERROR), $locale]);
            }
            $pdo->commit();
            return $faqs;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    $path = API_DATA . "/faqs-$locale.json";
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false) throw new RuntimeException('Unable to open FAQ lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock FAQs.');
        $faqs = $update(faq_read_file($path, $locale));
        if ($faqs === null) return null;

        $temp = tempnam(API_DATA, 'faqs-');
        if ($temp === false) throw new RuntimeException('Unable to create FAQ temporary file.');
        try {
            $json = json_encode($faqs, JSON_THROW_ON_ERROR);
            if (file_put_contents($temp, $json) !== strlen($json) || !rename($temp, $path)) {
                throw new RuntimeException('Unable to save FAQs.');
            }
        } finally {
            if (is_file($temp)) unlink($temp);
        }
        return $faqs;
    } finally {
        fclose($lock);
    }
}

function faq_request(string $method, ?string $id = null): never {
    $locale = locale_norm($_GET['locale'] ?? 'pt');
    if (!$locale) json_response(400, ['message' => 'Choose English or Portuguese.']);
    if ($method === 'GET') json_response(200, ['faqs' => faq_list($locale)]);

    $entry = ['id' => $id ?? uuid()];
    if ($method !== 'DELETE') {
        $body = body_json();
        foreach (['question' => 300, 'answer' => 5000] as $field => $limit) {
            $value = is_string($body[$field] ?? null) ? trim($body[$field]) : '';
            if ($value === '' || preg_match_all('/./us', $value) > $limit) {
                json_response(400, ['field' => $field, 'message' => "Enter a $field of up to $limit characters."]);
            }
            $entry[$field] = $value;
        }
    }

    $faqs = faq_update($locale, function (array $faqs) use ($method, $id, $entry): ?array {
        if ($method === 'POST') {
            $faqs[] = $entry;
            return $faqs;
        }
        foreach ($faqs as $index => $faq) {
            if ($faq['id'] !== $id) continue;
            if ($method === 'DELETE') array_splice($faqs, $index, 1);
            else $faqs[$index] = $entry;
            return $faqs;
        }
        return null;
    });
    if ($faqs === null) json_response(404, ['message' => 'FAQ not found.']);
    json_response($method === 'POST' ? 201 : 200, ['faqs' => $faqs]);
}
