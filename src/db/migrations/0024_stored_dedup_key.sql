-- Stored company+title key, so the feed can hide reposts of jobs already decided.
--
-- Same-platform repeats that reach the feed are overwhelmingly reposts of a job
-- the user already swiped: over 30 days, 803 of 856 non-Indeed repeats matched
-- an earlier copy the user had decided, 689 of them rejected. Those reposts
-- legitimately pass the insert-time dedup - they carry a new posted date and
-- the old copy is older than the 42-day window - so hiding them is a per-user
-- decision and belongs in the feed query, not the shared insert trigger.
--
-- Computing normalize_company_name()/normalize_for_dedup() per row inside that
-- query doubled the feed from ~1.0s to ~2.0s. Storing the key brings it back to
-- ~1.04s, measured against production.
--
-- Operational notes:
--   * ADD COLUMN ... STORED rewrites the table under an ACCESS EXCLUSIVE lock
--     (~18s on 32k rows). Apply outside the scraper windows, 11:00 and 17:00
--     UTC, or n8n inserts queue behind it.
--   * Stored values are computed when a row is written. If either normalizer is
--     ever redefined, existing keys go stale - refresh them with
--     UPDATE jobs SET company = company;
--   * Not declared in the Drizzle schema on purpose: it is read only through raw
--     SQL, and leaving it out keeps every Drizzle insert from trying to set it.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedup_key text
    GENERATED ALWAYS AS (normalize_company_name(company) || '|' || normalize_for_dedup(position)) STORED;

CREATE INDEX IF NOT EXISTS jobs_dedup_key_col_idx ON jobs (dedup_key, src_name);
