-- Stop the same ad being re-inserted each time a scraper re-sends it.
--
-- 0019 matched an existing copy only if that copy was POSTED within the last 42
-- days. A scraper that re-sends an old ad carries the ad's old posted_date, so
-- the existing copy is always outside the window and every re-scrape reads as
-- a brand-new vacancy. Measured over 30 days on Indeed: 406 same-platform
-- repeats, 379 of them with a posted_date identical to the earlier copy, ads
-- averaging 125 days old, up to 9 copies of one posting.
--
-- The window now also matches when:
--   * we ingested the existing copy within the window (created_at), so an old
--     ad re-sent days after we last stored it is caught; and
--   * the existing copy has the same posted date - the same advert, whatever
--     its age.
-- A genuine repost months later still gets through: it has a new posted date,
-- and the old copy was stored more than 42 days ago.

CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
RETURNS TRIGGER AS $$
DECLARE
    existing_job RECORD;
    suffix_counter INTEGER := 1;
    new_external_id TEXT;
    company_key TEXT;
    position_key TEXT;
    dedup_window CONSTANT INTERVAL := INTERVAL '42 days';
BEGIN
    company_key := normalize_company_name(NEW.company);
    position_key := normalize_for_dedup(NEW.position);

    IF company_key <> '' AND position_key <> '' THEN
        SELECT id, company, position, src_name, external_id, posted_date,
               coalesce(posted_date, created_at) AS seen_at,
               CASE
                   WHEN NEW.posted_date IS NOT NULL AND posted_date::date = NEW.posted_date::date
                       THEN 'same posted date'
                   WHEN created_at > now() - dedup_window
                       THEN 'stored within 42 days'
                   ELSE 'posted within 42 days'
               END AS matched_on
        INTO existing_job
        FROM jobs
        WHERE normalize_company_name(company) = company_key
          AND normalize_for_dedup(position) = position_key
          AND (
                coalesce(posted_date, created_at) > now() - dedup_window
             OR created_at > now() - dedup_window
             OR (NEW.posted_date IS NOT NULL AND posted_date::date = NEW.posted_date::date)
          )
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            PERFORM log_rejected_job(
                NEW,
                'duplicate',
                format('same company+title as job %s (%s) - "%s" at "%s", source %s, posted %s',
                       existing_job.id, existing_job.matched_on,
                       existing_job.position, existing_job.company,
                       coalesce(existing_job.src_name, 'unknown'),
                       coalesce(to_char(existing_job.posted_date, 'YYYY-MM-DD'), 'unknown'))
            );
            RETURN NULL;
        END IF;
    END IF;

    IF NEW.external_id IS NOT NULL AND NEW.external_id <> ''
       AND EXISTS (SELECT 1 FROM jobs WHERE external_id = NEW.external_id) THEN
        new_external_id := NEW.external_id || '-' || suffix_counter;
        WHILE EXISTS (SELECT 1 FROM jobs WHERE external_id = new_external_id) LOOP
            suffix_counter := suffix_counter + 1;
            new_external_id := NEW.external_id || '-' || suffix_counter;
        END LOOP;
        NEW.external_id := new_external_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
