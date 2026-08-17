-- Limit duplicate detection to a 6-week window.
--
-- Without a window, a company posting "Software Engineer" again months later -
-- a genuinely new requisition - was silently dropped as a duplicate of the old
-- one. The window was derived from this dataset rather than guessed.
--
-- Same-platform repeats are the clean signal: one board listing the same
-- company+title twice is either a refresh or a new req, with no cross-listing
-- to confuse it. That distribution is bimodal:
--
--   same day     284      1-2 months    47   (rising)
--   1-6 days     106      2-3 months    37
--   1-2 weeks     28      3+ months     97   (genuinely new reqs)
--   2-4 weeks     22  <-- trough
--
-- Below a month a repeat is the same vacancy; past six weeks it starts being a
-- new one. 42 days clears the trough and also absorbs cross-platform
-- posted_date disagreement, which stays significant out to two months because
-- boards report first-seen vs crawl date differently (138 pairs at 1-2 months).
-- JD-text identity was tested as an alternative discriminator and rejected: it
-- sits at 10-22% in every bucket including 3+ months, since boards reformat
-- descriptions.
--
-- Cost: releases 387 of the 2,784 pairs the unlimited rule blocked
-- (172 same-platform, 215 cross-platform). 30 days would release 461,
-- 60 days 276, 90 days 171.
--
-- The window is compared against the EXISTING row's date, so a new posting only
-- matches a copy that was itself posted inside the window - that is what lets a
-- three-month-later vacancy through. coalesce falls back to created_at for the
-- rows that carry no posted_date.
--
-- To change the window, edit the single interval below.

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

    -- A blank company or title carries no identity: leave those to the keyword
    -- filter rather than collapsing every untitled posting into a single row.
    IF company_key <> '' AND position_key <> '' THEN
        SELECT id, company, position, src_name, external_id,
               coalesce(posted_date, created_at) AS seen_at
        INTO existing_job
        FROM jobs
        WHERE normalize_company_name(company) = company_key
          AND normalize_for_dedup(position) = position_key
          AND coalesce(posted_date, created_at) > now() - dedup_window
        ORDER BY coalesce(posted_date, created_at) DESC
        LIMIT 1;

        IF FOUND THEN
            PERFORM log_rejected_job(
                NEW,
                'duplicate',
                format('same company+title as job %s posted %s (%s days ago) - "%s" at "%s", source %s',
                       existing_job.id,
                       to_char(existing_job.seen_at, 'YYYY-MM-DD'),
                       floor(extract(epoch FROM now() - existing_job.seen_at) / 86400)::int,
                       existing_job.position, existing_job.company,
                       coalesce(existing_job.src_name, 'unknown'))
            );
            RETURN NULL;
        END IF;
    END IF;

    -- Not a duplicate. If the external_id is already taken by a different job,
    -- give this one a suffix so the id stays a usable handle.
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
