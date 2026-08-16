-- Deduplicate jobs on content (company + title) rather than external_id.
--
-- Every platform mints its own external_id and n8n re-emits postings under
-- fresh ids, so the old `WHERE external_id = NEW.external_id` check could not
-- see 1,653 of 1,659 duplicate groups - 1,365 of which span two or more
-- platforms.
--
-- IMPORTANT: this does NOT use normalize_job_text(). That function is corrupt.
-- It was created from a JS template literal in src/apply-dedup-trigger.ts,
-- where JS silently turned \s into s, \. into . and \y into y, leaving:
--     REGEXP_REPLACE(result, 's+', ' ', 'g')
-- so it replaces the letter "s" with a space and strips no suffix at all:
--     'Salesforce, Inc.' -> 'ale force,'    'SAP SE' -> 'ap  e'
--     'Siemens'          -> 'iemen'         'n8n.io' -> 'n8n.io'
-- normalize_company_name() below is the corrected replacement. Written as a
-- .sql file precisely so the escapes survive.

CREATE OR REPLACE FUNCTION normalize_company_name(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN '';
    END IF;

    result := lower(trim(input_text));

    -- trailing domain suffix: n8n.io -> n8n
    result := regexp_replace(result,
        '\.(com|org|net|io|co|ai|dev|app|xyz|tech|info)\M', '', 'gi');

    -- legal-form suffixes, possibly stacked: "Foo GmbH & Co. KG" -> "foo"
    result := regexp_replace(result,
        '(\s*[,&]?\s*\m(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|mbh|ag|se|kg|kgaa|plc|bv|nv|sa|sarl|sàrl|srl|spa|oy|ab|as|aps|pte|pty|holding|group|gruppe)\M\.?)+\s*$',
        '', 'gi');

    result := regexp_replace(result, '[[:punct:][:space:]]+$', '');
    result := regexp_replace(result, '\s+', ' ', 'g');

    RETURN trim(result);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Repair normalize_job_text itself. Nothing in the insert path uses it once the
-- trigger below is in place, but are_texts_alike() still calls it and the
-- corruption would silently mangle anything else that reaches for it. These are
-- the escapes the original author intended, with \s \. \y intact.
CREATE OR REPLACE FUNCTION normalize_job_text(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN '';
    END IF;

    result := lower(input_text);
    result := trim(result);
    result := regexp_replace(result, '\s+', ' ', 'g');
    result := regexp_replace(result, '\.(com|org|net|io|co|ai|dev|app|xyz|tech|info)\y', '', 'gi');
    result := regexp_replace(result,
        '\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|gmbh|ag|plc)\s*$', '', 'gi');

    RETURN trim(result);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Supports the equality lookup in the trigger; both normalizers are IMMUTABLE.
CREATE INDEX IF NOT EXISTS jobs_dedup_key_idx
    ON jobs (normalize_company_name(company), normalize_for_dedup(position));

-- Matching is deliberately exact after normalization, on both sides.
--
-- Company: trigram similarity was measured against this dataset and rejected.
-- It is word-order blind, so "international systems" and "t-systems
-- international" score 0.92 by similarity() and 1.00 by
-- strict_word_similarity() - almost certainly different firms - while the
-- genuine matches sit in the same 0.90-0.94 band. No threshold separates them.
--
-- Title: every meaningful word is preserved, so "Engineer - Platform" and
-- "Engineer - Sales Dashboard" stay distinct roles, as do Senior/Junior
-- variants. Only gender tags, punctuation and case are normalized away.
CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
RETURNS TRIGGER AS $$
DECLARE
    existing_job RECORD;
    suffix_counter INTEGER := 1;
    new_external_id TEXT;
    company_key TEXT;
    position_key TEXT;
BEGIN
    company_key := normalize_company_name(NEW.company);
    position_key := normalize_for_dedup(NEW.position);

    -- A blank company or title carries no identity: leave those to the keyword
    -- filter rather than collapsing every untitled posting into a single row.
    IF company_key <> '' AND position_key <> '' THEN
        SELECT id, company, position, src_name, external_id
        INTO existing_job
        FROM jobs
        WHERE normalize_company_name(company) = company_key
          AND normalize_for_dedup(position) = position_key
        LIMIT 1;

        IF FOUND THEN
            PERFORM log_rejected_job(
                NEW,
                'duplicate',
                format('same company+title as existing job %s ("%s" at "%s", source %s, external_id %s)',
                       existing_job.id, existing_job.position, existing_job.company,
                       coalesce(existing_job.src_name, 'unknown'),
                       coalesce(existing_job.external_id, 'none'))
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
