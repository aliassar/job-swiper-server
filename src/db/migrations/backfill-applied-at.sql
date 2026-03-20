-- Backfill applied_at for applications that have moved beyond "Being Applied"
-- but never had applied_at set.
-- Uses last_updated as the best approximation of when the stage was changed.

UPDATE applications
SET applied_at = last_updated
WHERE applied_at IS NULL
  AND stage != 'Being Applied';
