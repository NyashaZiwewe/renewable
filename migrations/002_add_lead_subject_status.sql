-- Adds a subject and workflow status to existing lead records.
-- Safe to run more than once against the selected database.
SET @lead_subject_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'leads'
    AND column_name = 'subject'
);

SET @lead_subject_migration = IF(
  @lead_subject_column_exists = 0,
  'ALTER TABLE leads ADD COLUMN subject VARCHAR(200) NOT NULL DEFAULT ''Website query'' AFTER form_name',
  'SELECT 1'
);

PREPARE lead_subject_statement FROM @lead_subject_migration;
EXECUTE lead_subject_statement;
DEALLOCATE PREPARE lead_subject_statement;

SET @lead_status_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'leads'
    AND column_name = 'status'
);

SET @lead_status_migration = IF(
  @lead_status_column_exists = 0,
  'ALTER TABLE leads ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''new'' AFTER subject',
  'SELECT 1'
);

PREPARE lead_status_statement FROM @lead_status_migration;
EXECUTE lead_status_statement;
DEALLOCATE PREPARE lead_status_statement;
