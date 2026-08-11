-- Records jobs that are dropped at insert time instead of letting them vanish.
--
-- Three BEFORE INSERT triggers on `jobs` can discard a row. Postgres fires
-- same-type triggers in alphabetical order by trigger name, so the effective
-- order is:
--   1. prevent_duplicate_jobs_trigger  -> reason 'duplicate'
--   2. reject_unknown_jobs_trigger     -> reason 'unknown_company_and_position'
--   3. trg_filter_unwanted_jobs        -> reason 'absolute_keyword' / 'optimistic_keyword'
-- The first trigger to drop the row wins, so that is the reason recorded.

CREATE TABLE IF NOT EXISTS rejected_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id text,
    company text,
    position text,
    location text,
    job_url text,
    apply_link text,
    src_name text,
    posted_date timestamp,
    reason text NOT NULL,
    reason_detail text,
    payload jsonb NOT NULL,
    rejected_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rejected_jobs_rejected_at_idx ON rejected_jobs (rejected_at DESC);
CREATE INDEX IF NOT EXISTS rejected_jobs_reason_idx ON rejected_jobs (reason);
CREATE INDEX IF NOT EXISTS rejected_jobs_external_id_idx ON rejected_jobs (external_id) WHERE external_id IS NOT NULL;

-- Shared logger so every rejection path records the same shape.
CREATE OR REPLACE FUNCTION log_rejected_job(job jobs, rejection_reason text, detail text)
RETURNS void AS $$
BEGIN
    INSERT INTO rejected_jobs (
        external_id, company, position, location, job_url, apply_link,
        src_name, posted_date, reason, reason_detail, payload
    )
    VALUES (
        job.external_id, job.company, job.position, job.location, job.job_url,
        job.apply_link, job.src_name, job.posted_date, rejection_reason, detail,
        to_jsonb(job)
    );
END;
$$ LANGUAGE plpgsql;

-- 1. Duplicate detection: log which existing job it collided with.
CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
RETURNS TRIGGER AS $$
DECLARE
    existing_job RECORD;
    suffix_counter INTEGER := 1;
    new_external_id TEXT;
BEGIN
    IF NEW.external_id IS NULL OR NEW.external_id = '' THEN
        RETURN NEW;
    END IF;

    FOR existing_job IN
        SELECT id, company, position
        FROM jobs
        WHERE external_id = NEW.external_id
    LOOP
        IF are_texts_alike(NEW.company, existing_job.company) AND
           are_texts_alike(NEW.position, existing_job.position) THEN
            PERFORM log_rejected_job(
                NEW,
                'duplicate',
                format('same external_id as existing job %s ("%s" at "%s")',
                       existing_job.id, existing_job.position, existing_job.company)
            );
            RETURN NULL;
        END IF;
    END LOOP;

    -- Same externalId but a genuinely different job: give it a unique suffix.
    IF EXISTS (SELECT 1 FROM jobs WHERE external_id = NEW.external_id) THEN
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

-- 2. Unknown company AND position.
-- On INSERT this used to RAISE, which aborted the transaction and took any
-- rejection log down with it, so the row is now logged and dropped instead.
-- UPDATE still raises: silently cancelling an update would hide a real edit.
CREATE OR REPLACE FUNCTION reject_unknown_jobs()
RETURNS TRIGGER AS $$
BEGIN
    IF LOWER(NEW.company) = 'unknown' AND LOWER(NEW.position) = 'unknown' THEN
        IF TG_OP = 'INSERT' THEN
            PERFORM log_rejected_job(
                NEW,
                'unknown_company_and_position',
                'both company and position are "Unknown"'
            );
            RETURN NULL;
        ELSE
            RAISE EXCEPTION 'Jobs with Unknown company AND position are not allowed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Keyword filters: log which rule and which text matched.
CREATE OR REPLACE FUNCTION filter_unwanted_jobs()
RETURNS TRIGGER AS $$
DECLARE
  absolute_regex TEXT := '\y(working[\s\-]student|student|werkstudent(en|in)?|intern(ship)?|praktikant(en|in)?|praktikum|master.?s?[\s\-]+thesis|phd([\s\-]+(position|thesis|thethis))?|trainee|graduate)\y';
  optimistic_regex TEXT := '\y(embedded|informatiker|data[\s\-]engineer|machine[\s\-]learning[\s\-]engineer|it[\s\-]support|analyst|principal|lead|associate|data[\s\-]scientist|founding|sap[\s\-]developer|devops|chief|engineering[\s\-]manager|vice[\s\-]president|vp|manager|quantit(at)?ive|consultant)\y';
  keep_job BOOLEAN;
  matched TEXT;
  alternatives TEXT[];
BEGIN
  -- Absolute rejection: title contains a blocked keyword outright.
  IF NEW.position ~* absolute_regex THEN
    -- regexp_match with the 'i' flag, not substring(): substring() is
    -- case-sensitive and would never match the lowercase pattern.
    matched := (regexp_match(NEW.position, absolute_regex, 'i'))[1];
    PERFORM log_rejected_job(
        NEW,
        'absolute_keyword',
        format('position matched blocked keyword "%s"', matched)
    );
    RETURN NULL;
  END IF;

  -- Optimistic rejection: split the title on / | , (ignoring parenthesised
  -- text) and drop the job only if no alternative survives the filter list.
  alternatives := regexp_split_to_array(
      regexp_replace(NEW.position, '\([^)]*\)', '', 'g'), '[/|,]');

  SELECT EXISTS (
    SELECT 1
    FROM unnest(alternatives) AS alt
    WHERE alt !~* optimistic_regex
      AND trim(alt) != ''
  ) INTO keep_job;

  IF NOT keep_job THEN
    PERFORM log_rejected_job(
        NEW,
        'optimistic_keyword',
        format('no title alternative survived the filtered-role list; considered: %s',
               array_to_string(alternatives, ' | '))
    );
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
