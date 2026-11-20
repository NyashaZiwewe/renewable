CREATE TABLE IF NOT EXISTS whistleblowing_reports (
    id CHAR(36) PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    reporter_type VARCHAR(120) NOT NULL,
    outline TEXT NOT NULL,
    people TEXT NOT NULL,
    time_period VARCHAR(500) NOT NULL DEFAULT '',
    ongoing VARCHAR(40) NOT NULL,
    proof_links TEXT NOT NULL,
    information_nature VARCHAR(100) NOT NULL,
    superiors TEXT NOT NULL,
    email VARCHAR(254) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'new',
    created_at DATETIME(3) NOT NULL,
    INDEX idx_whistle_reports_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whistleblowing_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id CHAR(36) NOT NULL,
    sender VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    author_email VARCHAR(254) NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_whistle_messages_report_created(report_id, created_at),
    CONSTRAINT fk_whistle_messages_report FOREIGN KEY (report_id)
        REFERENCES whistleblowing_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
