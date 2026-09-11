-- Read-only evidence collection, not an executed result or a PASS assertion.
-- UI execution: dfadaa6e-f42a-40ba-aaad-166a75ff62ea, tenant reference.
-- Run only through the parent's approved PostgreSQL test connection.
-- Compare these exact values with the approved SQL Server reference fixture:
-- amount is negated, NULL amount rows are filtered, dimension fields are enriched.
-- Do not truncate, delete, rerun the pipeline, or update Connection metadata.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL TIME ZONE 'UTC';

SELECT count(*)::text AS target_rows,
       count(*) FILTER (WHERE amount IS NULL)::text AS null_amount_rows,
       count(DISTINCT record_id)::text AS distinct_record_ids
FROM reference.target_records;

-- Text casts avoid client-side numeric coercion. NULL flags distinguish NULL
-- from empty text; UTF-8 hex allows exact text comparison independent of display.
SELECT record_id::text AS record_id,
       tenant_key,
       dimension_key::text AS dimension_key,
       amount::text AS amount,
       occurred_at::text AS occurred_at_utc,
       nullable_text IS NULL AS nullable_text_is_null,
       encode(convert_to(nullable_text, 'UTF8'), 'hex') AS nullable_text_utf8_hex,
       empty_text IS NULL AS empty_text_is_null,
       encode(convert_to(empty_text, 'UTF8'), 'hex') AS empty_text_utf8_hex,
       unicode_text IS NULL AS unicode_text_is_null,
       encode(convert_to(unicode_text, 'UTF8'), 'hex') AS unicode_text_utf8_hex,
       dimension_label,
       dimension_version::text AS dimension_version
FROM reference.target_records
ORDER BY record_id;

COMMIT;
