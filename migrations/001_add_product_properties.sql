-- Adds JSON storage for a product's up to five key/value properties.
-- Safe to run more than once against the selected database.
SET @product_properties_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'products'
    AND column_name = 'properties'
);

SET @product_properties_migration = IF(
  @product_properties_column_exists = 0,
  'ALTER TABLE products ADD COLUMN properties LONGTEXT NULL AFTER currency',
  'SELECT 1'
);

PREPARE product_properties_statement FROM @product_properties_migration;
EXECUTE product_properties_statement;
DEALLOCATE PREPARE product_properties_statement;
