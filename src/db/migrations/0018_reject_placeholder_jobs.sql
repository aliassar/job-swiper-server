-- Reject scraped page furniture that is not a job posting.
--
-- StepStone's listing pages carry marketing banners ("Finde den Job,der zu dir
-- passt.", "Super zielstrebig!") which the scraper stores as jobs. They are
-- recognisable by company = 'Unknown' together with a missing posted_date:
-- across 31,879 rows that combination occurs 19 times and every one is a
-- banner, while no legitimate posting anywhere in the table lacks a date.
--
-- The company='Unknown' test is deliberately paired with the missing date. Four
-- rows have company='Unknown' but a real posted_date and a real title, and one
-- of them has already been applied to - blanket-blocking 'Unknown' would have
-- discarded it.
--
-- Glassdoor separately yields rows where the company column holds a raw JSON
-- blob ({"id":2892461,"name":"zh-technologies",...}) and the position is
-- literally 'Unknown'. Both are caught here.
--
-- Named filter_* so it sorts before prevent_duplicate_jobs_trigger and reports
-- the precise reason rather than logging the 14 banner copies as duplicates.

CREATE OR REPLACE FUNCTION filter_placeholder_jobs()
RETURNS TRIGGER AS $$
BEGIN
    -- Marketing banner scraped as a listing.
    IF lower(trim(NEW.company)) = 'unknown' AND NEW.posted_date IS NULL THEN
        PERFORM log_rejected_job(
            NEW,
            'placeholder_listing',
            format('company is "Unknown" with no posted_date - page furniture, not a posting (title: %s)',
                   left(NEW.position, 120))
        );
        RETURN NULL;
    END IF;

    -- Company column holding a raw JSON object instead of a name.
    IF NEW.company ~ '^\s*\{' THEN
        PERFORM log_rejected_job(
            NEW,
            'malformed_company',
            format('company field contains a JSON blob rather than a name: %s',
                   left(NEW.company, 120))
        );
        RETURN NULL;
    END IF;

    -- Title never resolved during scraping.
    IF lower(trim(NEW.position)) = 'unknown' THEN
        PERFORM log_rejected_job(
            NEW,
            'unknown_position',
            format('position is literally "Unknown" (company: %s)', left(NEW.company, 120))
        );
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS filter_placeholder_jobs_trigger ON jobs;
CREATE TRIGGER filter_placeholder_jobs_trigger
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION filter_placeholder_jobs();
