-- Select the website database in phpMyAdmin before running this script.
-- Company branding, contact details, social links and map coordinates.
CREATE TABLE IF NOT EXISTS company_settings (
    id TINYINT NOT NULL,
    payload LONGTEXT NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team introduction and profiles, stored separately for English and Portuguese.
CREATE TABLE IF NOT EXISTS team_content (
    locale VARCHAR(2) NOT NULL,
    payload LONGTEXT NOT NULL,
    PRIMARY KEY (locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Partner logos, website links and carousel order.
CREATE TABLE IF NOT EXISTS partner_content (
    id TINYINT NOT NULL,
    payload LONGTEXT NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rows are created when the admin saves content. Existing data is preserved.
